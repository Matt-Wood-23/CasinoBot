/**
 * Blackjack payout logic.
 *
 * This used to live in five copy-pasted blocks: two in main.js (the initial
 * deal) and three in handlers/buttons/blackjackButtons.js (player action,
 * multiplayer action, turn timeout). The copies had drifted — the ones in
 * main.js never applied the holiday winnings bonus, never awarded guild XP and
 * never recorded the hand to guild events — so a hand that ended on the deal
 * (dealer blackjack) paid differently from an identical hand that ended after a
 * stand. Nothing stopped two concurrent interactions from settling the same
 * hand twice either.
 *
 * Everything now goes through settleBlackjackGame(), which is idempotent: the
 * first call marks game.settled and every later call is a no-op.
 */

const {
    getUserMoney,
    setUserMoney,
    recordGameResult,
    getServerJackpot,
    resetJackpot
} = require('../database/queries');
const { applyHolidayWinningsBonus } = require('./holidayEvents');
const { awardGameXP, awardWagerXP } = require('./guildXP');
const { recordGameToEvents } = require('./eventIntegration');

/**
 * Collapse per-hand results into the single result string the stats tables use.
 * A split can produce several outcomes at once; the best one wins.
 */
function summariseResults(results) {
    if (!Array.isArray(results)) return results;
    if (results.includes('blackjack')) return 'blackjack';
    if (results.includes('win')) return 'win';
    if (results.includes('lose')) return 'lose';
    return 'push';
}

/**
 * Fire-and-forget progression updates. These are best effort: a guild XP
 * outage must never block or fail a payout that already moved money.
 */
function recordProgression(playerId, bet, winnings, result) {
    const won = result === 'win' || result === 'blackjack';

    awardWagerXP(playerId, bet, 'Blackjack').catch(err =>
        console.error('Error awarding wager XP:', err)
    );
    awardGameXP(playerId, 'Blackjack', won).catch(err =>
        console.error('Error awarding game XP:', err)
    );
    recordGameToEvents(playerId, 'Blackjack', bet, winnings > 0 ? winnings : 0).catch(err =>
        console.error('Error recording game to events:', err)
    );
}

/**
 * Pay the progressive jackpot to a player holding a natural blackjack.
 * Returns { jackpotWon, loanInfo } — loanInfo is null when nothing was paid.
 */
async function awardJackpot(game, playerId, moneyBeforeJackpot) {
    try {
        const jackpotData = await getServerJackpot(game.serverId);
        if (!jackpotData || jackpotData.currentAmount <= 0) {
            return { jackpotWon: 0, loanInfo: null };
        }

        const jackpotWon = jackpotData.currentAmount;
        const loanInfo = await setUserMoney(playerId, moneyBeforeJackpot + jackpotWon);
        await resetJackpot(game.serverId, playerId, jackpotWon);

        // Surfaced by the game embed.
        game.jackpotWinner = playerId;
        game.jackpotAmount = jackpotWon;

        return { jackpotWon, loanInfo };
    } catch (error) {
        console.error('Error awarding blackjack jackpot:', error);
        return { jackpotWon: 0, loanInfo: null };
    }
}

/**
 * Settle one player against the dealer: credit the balance, record the hand,
 * award the jackpot if this is the game's first natural blackjack.
 */
async function settlePlayerVsDealer(game, playerId, jackpotAlreadyAwarded) {
    const baseWinnings = game.getWinnings(playerId);
    const winnings = applyHolidayWinningsBonus(baseWinnings);
    const totalBet = game.getTotalBet(playerId);

    const currentMoney = await getUserMoney(playerId);
    // The bet was taken up front, so the stake is returned and the (possibly
    // negative) winnings applied on top.
    const newMoney = currentMoney + totalBet + winnings;

    let loanInfo = await setUserMoney(playerId, newMoney);
    const result = summariseResults(game.getResult(playerId));

    let jackpotWon = 0;
    // A split hand that makes 21 is not a natural, so it does not qualify.
    if (!jackpotAlreadyAwarded && game.serverId && game.hasNaturalBlackjack(playerId)) {
        const jackpot = await awardJackpot(game, playerId, newMoney);
        jackpotWon = jackpot.jackpotWon;
        if (jackpot.loanInfo) loanInfo = jackpot.loanInfo;
    }

    if (loanInfo) {
        game.loanDeductions.set(playerId, loanInfo);
        if (!game.isMultiPlayer) game.loanDeduction = loanInfo;
    }

    await recordGameResult(playerId, 'blackjack', totalBet, winnings, result, {
        handsPlayed: game.players.get(playerId).hands.length,
        jackpotWon
    });

    recordProgression(playerId, totalBet, winnings, result);

    return jackpotWon > 0;
}

/**
 * Head-to-head duel: no dealer, the winner takes both stakes.
 */
async function settleDuel(game) {
    const players = Array.from(game.players.keys());
    if (players.length !== 2) return;

    const [playerAId, playerBId] = players;
    const pvpResult = game.calculatePvPWinner(playerAId, playerBId);

    if (pvpResult.isPush) {
        for (const playerId of players) {
            const stake = game.getTotalBet(playerId);
            const currentMoney = await getUserMoney(playerId);
            await setUserMoney(playerId, currentMoney + stake);
            await recordGameResult(playerId, 'blackjack', stake, 0, 'push', { pvpDuel: true });
            recordProgression(playerId, stake, 0, 'push');
        }
        game.pvpResult = { isPush: true };
        return;
    }

    const { winnerId, amount: potAmount } = pvpResult;
    const loserId = winnerId === playerAId ? playerBId : playerAId;
    const winnerBet = game.getTotalBet(winnerId);
    const loserBet = game.getTotalBet(loserId);

    const winnerMoney = await getUserMoney(winnerId);
    await setUserMoney(winnerId, winnerMoney + potAmount);

    await recordGameResult(winnerId, 'blackjack', winnerBet, potAmount - winnerBet, 'win', {
        pvpDuel: true,
        potWon: potAmount
    });
    await recordGameResult(loserId, 'blackjack', loserBet, -loserBet, 'lose', { pvpDuel: true });

    recordProgression(winnerId, winnerBet, potAmount - winnerBet, 'win');
    recordProgression(loserId, loserBet, -loserBet, 'lose');

    game.pvpResult = { winnerId, amount: potAmount };
}

/**
 * Settle a finished blackjack game exactly once.
 *
 * @returns {Promise<boolean>} true if this call performed the settlement,
 *   false if the game was not over or had already been settled.
 */
async function settleBlackjackGame(game) {
    if (!game || !game.gameOver || game.settled) return false;

    // Claimed synchronously, before the first await, so two interactions racing
    // into this function cannot both get past the guard.
    game.settled = true;
    game.loanDeductions = game.loanDeductions || new Map();

    try {
        if (game.isDuel) {
            await settleDuel(game);
        } else {
            let jackpotAwarded = false;
            for (const playerId of game.players.keys()) {
                const awarded = await settlePlayerVsDealer(game, playerId, jackpotAwarded);
                jackpotAwarded = jackpotAwarded || awarded;
            }
        }
        return true;
    } catch (error) {
        // Releasing the guard would risk paying a player twice, so the game
        // stays marked settled and the failure is surfaced to the caller.
        console.error('Error settling blackjack game:', error);
        throw error;
    }
}

module.exports = { settleBlackjackGame, summariseResults };
