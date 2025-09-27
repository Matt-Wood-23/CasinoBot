const { EmbedBuilder } = require('discord.js');
const { getUserData } = require('./data');

async function createGameEmbed(game, userId, client) {
    let embed;
    
    if (game.constructor.name === 'ThreeCardPokerGame') {
        return await createPokerEmbed(game, userId);
    } else if (game.constructor.name === 'SlotsGame') {
        return await createSlotsEmbed(game, userId);
    } else if (game.constructor.name === 'BlackjackGame') {
        return await createBlackjackEmbed(game, userId, client);
    }
    
    return new EmbedBuilder()
        .setTitle('❌ Unknown Game Type')
        .setColor('#FF0000')
        .setDescription('Unknown game type encountered.');
}

async function createPokerEmbed(game, userId) {
    const userData = getUserData(userId);
    const userMoney = userData ? userData.money : 500;
    
    const embed = new EmbedBuilder()
        .setTitle('🃏 3 Card Poker')
        .setColor(game.gamePhase === 'complete' ? 
            (game.calculateWinnings().total >= 0 ? '#00FF00' : '#FF0000') : '#0099FF');

    // Player cards (always visible)
    const playerCardsText = game.playerCards.map(card => card.getName()).join(' ');
    const playerHandDesc = game.getHandDescription(game.playerCards);
    embed.addFields({
        name: '🎰 Your Cards',
        value: `${playerCardsText}\n**${playerHandDesc}**`,
        inline: false
    });

    // Dealer cards (show based on game phase)
    if (game.gamePhase === 'decision') {
        embed.addFields({
            name: '🏠 Dealer Cards',
            value: '🂠 🂠 🂠 (Hidden)',
            inline: false
        });
    } else {
        const dealerCardsText = game.dealerCards.map(card => card.getName()).join(' ');
        const dealerHandDesc = game.getHandDescription(game.dealerCards);
        const qualifiesText = game.dealerQualifies() ? '✅ Qualifies' : '❌ Does Not Qualify';
        embed.addFields({
            name: '🏠 Dealer Cards',
            value: `${dealerCardsText}\n**${dealerHandDesc}** (${qualifiesText})`,
            inline: false
        });
    }

    // Betting information
    let bettingInfo = `💰 Ante: ${game.anteBet}`;
    if (game.pairPlusBet > 0) {
        bettingInfo += `\n🎯 Pair Plus: ${game.pairPlusBet}`;
    }
    if (game.playBet > 0) {
        bettingInfo += `\n🎲 Play: ${game.playBet}`;
    }
    embed.addFields({
        name: '💰 Bets',
        value: bettingInfo,
        inline: true
    });

    embed.addFields({
        name: '💵 Your Money',
        value: `${userMoney.toLocaleString()}`,
        inline: true
    });

    // Game status/results
    if (game.gamePhase === 'decision') {
        embed.setDescription('**Your Turn!** Choose to Play (bet equals ante) or Fold.');
    } else if (game.gamePhase === 'showdown') {
        embed.setDescription('**Showdown!** Cards revealed, calculating results...');
    } else if (game.gamePhase === 'complete') {
        const winnings = game.calculateWinnings();
        let resultText = '';

        if (game.playerDecision === 'fold') {
            resultText = `💸 **You folded!**\n`;
        } else {
            const comparison = game.compareHands();
            if (comparison === 'player') {
                resultText = `🎉 **You won!**\n`;
            } else if (comparison === 'dealer') {
                resultText = `💸 **Dealer won!**\n`;
            } else {
                resultText = `🤝 **Tie!**\n`;
            }
        }

        // Breakdown
        if (winnings.breakdown.anteBonus) {
            resultText += `🌟 Ante Bonus: +${winnings.breakdown.anteBonus}\n`;
        }
        if (winnings.breakdown.ante !== undefined) {
            resultText += `💰 Ante: ${winnings.breakdown.ante >= 0 ? '+' : ''}${winnings.breakdown.ante}\n`;
        }
        if (winnings.breakdown.play !== undefined) {
            resultText += `🎲 Play: ${winnings.breakdown.play >= 0 ? '+' : ''}${winnings.breakdown.play}\n`;
        }
        if (winnings.breakdown.pairPlus !== undefined && winnings.breakdown.pairPlus !== 0) {
            resultText += `🎯 Pair Plus: ${winnings.breakdown.pairPlus >= 0 ? '+' : ''}${winnings.breakdown.pairPlus}\n`;
        }

        resultText += `\n**Total: ${winnings.total >= 0 ? '+' : ''}${winnings.total}**`;

        embed.addFields({
            name: '📊 Result',
            value: resultText,
            inline: false
        });
    }

    return embed;
}

async function createSlotsEmbed(game, userId) {
    const userData = getUserData(userId);
    const userMoney = userData ? userData.money : 500;
    
    const embed = new EmbedBuilder()
        .setTitle('🎰 Slot Machine')
        .setColor(game.winnings > 0 ? '#00FF00' : '#FF0000')
        .setDescription(`**Bet: ${game.bet}**\n${game.getGrid()}\n**Winnings: ${game.winnings > 0 ? '+' : ''}${game.winnings}**`)
        .addFields({
            name: '💵 Your Money',
            value: `${userMoney.toLocaleString()}`,
            inline: true
        });

    if (game.winnings > 0) {
        const winningLinesDesc = game.getWinningLinesDescription();
        embed.addFields({
            name: '🎉 Win!',
            value: winningLinesDesc || `You won on ${game.winningLines.length} lines!`,
            inline: false
        });
    } else {
        embed.addFields({
            name: '😔 No Win',
            value: 'Better luck next time!',
            inline: false
        });
    }

    return embed;
}

async function createBlackjackEmbed(game, userId, client) {
    const userData = getUserData(userId);
    const userMoney = userData ? userData.money : 500;
    
    let embed;
    
    if (game.isMultiPlayer) {
        embed = new EmbedBuilder()
            .setTitle('🃏 Blackjack Table')
            .setColor(game.gameOver ? '#FFD700' : '#0099FF');
            
        if (game.bettingPhase) {
            return await createBettingPhaseEmbed(game, userId, client);
        } else {
            return await createMultiPlayerGameEmbed(game, userId, client);
        }
    } else {
        return await createSinglePlayerGameEmbed(game, userId);
    }
}

async function createBettingPhaseEmbed(game, userId, client) {
    const embed = new EmbedBuilder()
        .setTitle('🃏 Blackjack Table')
        .setColor('#0099FF');
        
    let bettingText = `Waiting for players to ready up...\n\n**Your Bet: ${game.players.get(userId)?.bet || 'Not in game'}**\n\n`;
    
    for (const [playerId, player] of game.players) {
        let username = 'Unknown User';
        try {
            const user = client.users.cache.get(playerId) || await client.users.fetch(playerId);
            username = user.username;
        } catch (error) {
            console.error(`Error fetching user ${playerId}:`, error);
        }
        
        const ready = game.readyPlayers.has(playerId);
        bettingText += `${username}: ${ready ? `✅ Ready (${game.readyPlayers.get(playerId)})` : `⏳ Not Ready (${player.bet})`}\n`;
    }
    
    embed.setDescription(bettingText);
    embed.addFields({
        name: '📊 Status',
        value: 'Waiting for all players to confirm bets...',
        inline: false
    });
    
    return embed;
}

async function createMultiPlayerGameEmbed(game, userId, client) {
    const embed = new EmbedBuilder()
        .setTitle('🃏 Blackjack Table')
        .setColor(game.gameOver ? '#FFD700' : '#0099FF');

    let dealerText = 'Waiting for cards...';
    if (game.dealingPhase >= 3) {
        dealerText = (game.dealer.cards && Array.isArray(game.dealer.cards))
            ? game.dealer.cards.map(card => card.getName()).join(' ')
            : 'No dealer cards yet';
            
        if (game.dealingPhase >= 4 && !game.gameOver) {
            dealerText += ' 🂠 (??)';
        } else if (game.gameOver) {
            dealerText = game.getDealerCards(true).map(card => card.getName()).join(' ');
        }
    }
    
    embed.addFields({
        name: '🏠 Dealer Cards',
        value: dealerText + (game.gameOver ? ` (${game.getDealerScore(true)})` : 
               game.dealingPhase >= 3 ? ` (${game.getDealerScore(false)})` : ''),
        inline: false
    });

    // Add player hands
    let currentPlayerId = Array.from(game.players.keys())[game.currentPlayerIndex];
    for (const [playerId, player] of game.players) {
        if (!player.hands || player.hands.length === 0) continue;
        
        let username = 'Unknown User';
        try {
            const user = client.users.cache.get(playerId) || await client.users.fetch(playerId);
            username = user.username;
        } catch (error) {
            console.error(`Error fetching user ${playerId}:`, error);
        }
        
        for (let i = 0; i < player.hands.length; i++) {
            const hand = player.hands[i];
            const visibleCards = game.dealingPhase >= 2 ? hand.cards : 
                                (game.dealingPhase === 1 ? [hand.cards[0]] : []);
            const handScore = game.dealingPhase >= 2 ? game.calculateScore(hand.cards) : 
                            (game.dealingPhase === 1 ? game.calculateScore([hand.cards[0]]) : 0);
            const isCurrentHand = i === player.currentHandIndex && !game.gameOver && 
                                game.dealingPhase >= 5 && playerId === currentPlayerId && !player.stood;
            const handName = player.hands.length > 1 ? 
                           `🎰 ${username} - Hand ${i + 1}${isCurrentHand ? ' (Current)' : ''}` : 
                           `🎰 ${username}`;
                           
            let handValue = visibleCards.length > 0 ? 
                          `${visibleCards.map(card => card.getName()).join(' ')} (${handScore})` : 
                          'Waiting for cards...';
                          
            if (game.dealingPhase >= 2) {
                if (handScore > 21) handValue += ' **BUST**';
                if (handScore === 21 && hand.cards.length === 2) handValue += ' **BLACKJACK**';
            }
            
            embed.addFields({
                name: handName,
                value: `${handValue}\n💰 Bet: ${hand.bet}`,
                inline: true
            });
        }
    }

    if (game.gameOver) {
        embed.setDescription('Game over! Results displayed below.');
        let resultText = 'Results:\n';
        
        for (const [playerId, player] of game.players) {
            let username = 'Unknown User';
            try {
                const user = client.users.cache.get(playerId) || await client.users.fetch(playerId);
                username = user.username;
            } catch (error) {
                console.error(`Error fetching user ${playerId}:`, error);
            }
            
            const results = game.getResult(playerId);
            const totalWinnings = game.getWinnings(playerId);
            
            resultText += `${username}:\n`;
            for (let i = 0; i < results.length; i++) {
                const handBet = player.hands[i].bet;
                const result = results[i];
                let handResult = '';
                
                switch (result) {
                    case 'blackjack':
                        handResult = `Won ${Math.floor(handBet * 1.5)}`;
                        break;
                    case 'win':
                        handResult = `Won ${handBet}`;
                        break;
                    case 'lose':
                        handResult = `Lost ${handBet}`;
                        break;
                    case 'push':
                        handResult = `Push`;
                        break;
                }
                resultText += `Hand ${i + 1}: ${handResult}\n`;
            }
            resultText += `**Total: ${totalWinnings >= 0 ? '+' : ''}${totalWinnings}**\n`;
        }
        
        embed.addFields({ name: '📊 Results', value: resultText, inline: false });
    } else if (game.dealingPhase < 5) {
        embed.setDescription('Waiting for players or dealing cards...');
        embed.addFields({
            name: '📊 Status',
            value: 'Dealing cards...',
            inline: false
        });
    } else {
        const currentPlayerId = Array.from(game.players.keys())[game.currentPlayerIndex];
        let username = 'Unknown User';
        try {
            const user = client.users.cache.get(currentPlayerId) || await client.users.fetch(currentPlayerId);
            username = user.username;
        } catch (error) {
            console.error(`Error fetching user ${currentPlayerId}:`, error);
        }
        
        embed.setDescription(`Waiting for ${username}'s action...`);
        embed.addFields({
            name: '📊 Status',
            value: `Waiting for ${username}'s action...`,
            inline: false
        });
    }

    return embed;
}

async function createSinglePlayerGameEmbed(game, userId) {
    const userData = getUserData(userId);
    const userMoney = userData ? userData.money : 500;
    const player = game.players.get(userId);
    
    const embed = new EmbedBuilder()
        .setTitle('🃏 Blackjack Game')
        .setColor(game.gameOver ? (game.getWinnings(userId) >= 0 ? '#00FF00' : '#FF0000') : '#0099FF');

    if (!player.hands || player.hands.length === 0) {
        embed.setDescription('Game data corrupted. Please start a new game.');
        embed.addFields({ name: '❌ Error', value: 'Game data corrupted. Please start a new game.', inline: false });
        return embed;
    }

    // Player hands
    for (let i = 0; i < player.hands.length; i++) {
        const hand = player.hands[i];
        const visibleCards = game.dealingPhase >= 2 ? hand.cards : 
                           (game.dealingPhase === 1 ? [hand.cards[0]] : []);
        const handScore = game.dealingPhase >= 2 ? game.calculateScore(hand.cards) : 
                         (game.dealingPhase === 1 ? game.calculateScore([hand.cards[0]]) : 0);
        const isCurrentHand = i === player.currentHandIndex && !game.gameOver && game.dealingPhase >= 5;
        const handName = player.hands.length > 1 ? 
                        `🎰 Hand ${i + 1}${isCurrentHand ? ' (Current)' : ''}` : 
                        '🎰 Your Cards';
                        
        let handValue = visibleCards.length > 0 ? 
                       `${visibleCards.map(card => card.getName()).join(' ')} (${handScore})` : 
                       'Waiting for cards...';
                       
        if (game.dealingPhase >= 2) {
            if (handScore > 21) handValue += ' **BUST**';
            if (handScore === 21 && hand.cards.length === 2) handValue += ' **BLACKJACK**';
        }
        
        embed.addFields({
            name: handName,
            value: handValue,
            inline: true
        });
    }

    // Dealer cards
    let dealerText = 'Waiting for cards...';
    if (game.dealingPhase >= 3) {
        dealerText = (game.dealer.cards && Array.isArray(game.dealer.cards))
            ? game.dealer.cards.map(card => card.getName()).join(' ')
            : 'No dealer cards yet';
            
        if (game.dealingPhase >= 4 && !game.gameOver) {
            dealerText += ' 🂠 (??)';
        } else if (game.gameOver) {
            dealerText = game.getDealerCards(true).map(card => card.getName()).join(' ');
        }
    }
    
    embed.addFields({
        name: '🏠 Dealer Cards',
        value: dealerText + (game.gameOver ? ` (${game.getDealerScore(true)})` : 
               game.dealingPhase >= 3 ? ` (${game.getDealerScore(false)})` : ''),
        inline: true
    });

    // Betting information
    embed.addFields(
        {
            name: '💰 Main Bet',
            value: `${game.getTotalBet(userId).toLocaleString()}`,
            inline: true
        },
        {
            name: '💵 Your Money',
            value: `${userMoney.toLocaleString()}`,
            inline: true
        }
    );

    // Side bets
    const sideBets = game.sideBets.get(userId);
    if (sideBets && (sideBets.insurance > 0 || sideBets.perfectPairs > 0)) {
        let sideBetText = '';
        
        if (sideBets.perfectPairs > 0) {
            sideBetText += `🎯 Perfect Pairs: ${sideBets.perfectPairs}`;
            if (game.perfectPairsResults.has(userId)) {
                const result = game.perfectPairsResults.get(userId);
                if (result.result !== 'lose') {
                    sideBetText += ` ✅ ${result.result.replace('_', ' ').toUpperCase()} (+${sideBets.perfectPairs * result.payout})`;
                } else {
                    sideBetText += ` ❌ Lost`;
                }
            }
        }
        
        if (sideBets.insurance > 0) {
            if (sideBetText) sideBetText += '\n';
            sideBetText += `🛡️ Insurance: ${sideBets.insurance}`;
            if (game.gameOver) {
                if (game.hasDealerBlackjack()) {
                    sideBetText += ` ✅ (+${sideBets.insurance * 2})`;
                } else {
                    sideBetText += ` ❌ Lost`;
                }
            }
        }

        embed.addFields({
            name: '🎲 Side Bets',
            value: sideBetText,
            inline: true
        });
    }

    // Game results
    if (game.gameOver) {
        embed.setDescription('Game over! Results displayed below.');
        const totalWinnings = game.getWinnings(userId);
        let resultText = '';
        const results = game.getResult(userId);
        
        if (player.hands.length === 1) {
            const result = results[0];
            if (game.hasDealerBlackjack() && !game.hasBlackjack(player.hands[0].cards)) {
                resultText = `💸 Dealer has BLACKJACK! You lost ${Math.abs(totalWinnings).toLocaleString()}!`;
            } else {
                switch (result) {
                    case 'blackjack':
                        resultText = `🎉 BLACKJACK! You won ${totalWinnings.toLocaleString()}!`;
                        break;
                    case 'win':
                        resultText = `🎉 You won ${totalWinnings.toLocaleString()}!`;
                        break;
                    case 'lose':
                        resultText = `💸 You lost ${Math.abs(totalWinnings).toLocaleString()}!`;
                        break;
                    case 'push':
                        resultText = `🤝 Push! Bet returned.`;
                        break;
                }
            }
        } else {
            resultText = 'Results:\n';
            for (let i = 0; i < results.length; i++) {
                const handBet = player.hands[i].bet;
                const result = results[i];
                let handResult = '';
                
                switch (result) {
                    case 'blackjack':
                        handResult = `Won ${Math.floor(handBet * 1.5).toLocaleString()}`;
                        break;
                    case 'win':
                        handResult = `Won ${handBet.toLocaleString()}`;
                        break;
                    case 'lose':
                        handResult = `Lost ${handBet.toLocaleString()}`;
                        break;
                    case 'push':
                        handResult = `Push`;
                        break;
                }
                resultText += `Hand ${i + 1}: ${handResult}\n`;
            }
            resultText += `**Total: ${totalWinnings >= 0 ? '+' : ''}${totalWinnings.toLocaleString()}**`;
        }
        
        embed.addFields({ name: '📊 Result', value: resultText, inline: false });
    } else if (game.dealingPhase < 5) {
        if (game.sideBetPhase) {
            embed.setDescription('⏰ Place your side bets! Time remaining...');
        } else {
            embed.setDescription('Dealing cards...');
        }
        embed.addFields({
            name: '📊 Status',
            value: game.sideBetPhase ? 'Side bet phase - place your bets!' : 'Dealing cards...',
            inline: false
        });
    }

    return embed;
}

// Utility functions for creating specific embed types
function createErrorEmbed(title, description) {
    return new EmbedBuilder()
        .setTitle(`❌ ${title}`)
        .setDescription(description)
        .setColor('#FF0000')
        .setTimestamp();
}

function createSuccessEmbed(title, description) {
    return new EmbedBuilder()
        .setTitle(`✅ ${title}`)
        .setDescription(description)
        .setColor('#00FF00')
        .setTimestamp();
}

function createInfoEmbed(title, description) {
    return new EmbedBuilder()
        .setTitle(`ℹ️ ${title}`)
        .setDescription(description)
        .setColor('#0099FF')
        .setTimestamp();
}

async function createLeaderboardEmbed(client) {
    const { getAllUserData } = require('./data');
    const userData = getAllUserData() || {}; // Ensure userData is an object
    
    const sortedUsers = Object.entries(userData)
        .filter(([_, data]) => data && typeof data === 'object' && 'money' in data)
        .map(([userId, data]) => ({ userId, money: Number(data.money) || 0 }))
        .sort((a, b) => b.money - a.money);

    const embed = new EmbedBuilder()
        .setTitle('🏆 Blackjack Leaderboard')
        .setColor('#FFD700')
        .setTimestamp();

    if (sortedUsers.length === 0) {
        embed.setDescription('No players have registered yet!');
        return embed;
    }

    let leaderboardText = '';
    for (let i = 0; i < Math.min(sortedUsers.length, 10); i++) {
        const { userId, money } = sortedUsers[i];
        let username = 'Unknown User';
        
        try {
            const user = await client.users.fetch(userId);
            username = user.tag;
        } catch (error) {
            console.error(`Error fetching user ${userId}:`, error);
        }
        
        leaderboardText += `${i + 1}. **${username}**: ${money.toLocaleString()}\n`;
    }

    if (sortedUsers.length > 10) {
        leaderboardText += `\n...and ${sortedUsers.length - 10} more players!`;
    }

    embed.setDescription(leaderboardText);
    return embed;
}

async function createStatsEmbed(targetUser, client) {
    const { getUserData } = require('./data');
    const userData = getUserData(targetUser.id);
    
    if (!userData) {
        return createErrorEmbed('No Data', 'No statistics found for this user.');
    }

    const stats = userData.statistics;
    const winRate = stats.gamesPlayed > 0 ? ((stats.gamesWon / stats.gamesPlayed) * 100).toFixed(1) : 0;
    const slotsWinRate = stats.slotsSpins > 0 ? ((stats.slotsWins / stats.slotsSpins) * 100).toFixed(1) : 0;
    const pokerWinRate = stats.threeCardPokerGames > 0 ? ((stats.threeCardPokerWins / stats.threeCardPokerGames) * 100).toFixed(1) : 0;
    const profitLoss = stats.totalWinnings - stats.totalWagered;

    const embed = new EmbedBuilder()
        .setTitle(`📊 ${targetUser.username}'s Statistics`)
        .setColor('#0099FF')
        .setThumbnail(targetUser.displayAvatarURL())
        .addFields(
            { name: '🎮 Games Played', value: (stats.gamesPlayed || 0).toLocaleString(), inline: true },
            { name: '🏆 Games Won', value: (stats.gamesWon || 0).toLocaleString(), inline: true },
            { name: '📈 Win Rate', value: `${winRate}%`, inline: true },
            { name: '💰 Total Wagered', value: `${(stats.totalWagered || 0).toLocaleString()}`, inline: true },
            { name: '💵 Total Winnings', value: `${(stats.totalWinnings || 0).toLocaleString()}`, inline: true },
            { name: '📊 Net Profit/Loss', value: `${profitLoss >= 0 ? '+' : ''}${(profitLoss || 0).toLocaleString()}`, inline: true },
            { name: '🌟 Biggest Win', value: `${(stats.biggestWin || 0).toLocaleString()}`, inline: true },
            { name: '💔 Biggest Loss', value: `${(stats.biggestLoss || 0).toLocaleString()}`, inline: true },
            { name: '⚡ Blackjacks', value: (stats.blackjacks || 0).toLocaleString(), inline: true },
            { name: '🎰 Slots Spins', value: (stats.slotsSpins || 0).toLocaleString(), inline: true },
            { name: '🎰 Slots Wins', value: (stats.slotsWins || 0).toLocaleString(), inline: true },
            { name: '📈 Slots Win Rate', value: `${slotsWinRate}%`, inline: true },
            { name: '🃏 Poker Games', value: (stats.threeCardPokerGames || 0).toLocaleString(), inline: true },
            { name: '🃏 Poker Wins', value: (stats.threeCardPokerWins || 0).toLocaleString(), inline: true },
            { name: '📈 Poker Win Rate', value: `${pokerWinRate}%`, inline: true },
            { name: '🎁 Gifts Sent', value: (userData.giftsSent || 0).toLocaleString(), inline: true },
            { name: '🎀 Gifts Received', value: (userData.giftsReceived || 0).toLocaleString(), inline: true },
            { name: '💳 Current Balance', value: `${(userData.money || 0).toLocaleString()}`, inline: true }
        )
        .setTimestamp();

    return embed;
}

async function createHistoryEmbed(user, gamesToShow = 10) {
    const { getUserData } = require('./data');
    const userData = getUserData(user.id);
    
    if (!userData || !userData.gameHistory || userData.gameHistory.length === 0) {
        return createInfoEmbed('No History', 'You have no game history yet! Play some games first.');
    }

    const history = userData.gameHistory.slice(0, gamesToShow);

    const embed = new EmbedBuilder()
        .setTitle(`📜 Your Recent Game History (Last ${history.length} games)`)
        .setColor('#FFD700')
        .setThumbnail(user.displayAvatarURL());

    let historyText = '';
    for (const game of history) {
        const date = new Date(game.timestamp).toLocaleDateString();
        const resultEmoji = game.result === 'win' || game.result === 'blackjack' ? '🟢' :
                           game.result === 'push' ? '🟡' : '🔴';
        const resultText = game.result === 'blackjack' ? 'BLACKJACK!' : game.result.toUpperCase();

        historyText += `${resultEmoji} **${resultText}** - ${game.gameType.toUpperCase()}: Bet ${game.bet.toLocaleString()}, `;
        historyText += `${game.winnings >= 0 ? 'Won' : 'Lost'}: ${Math.abs(game.winnings).toLocaleString()} `;
        historyText += `(${date})\n`;
    }

    embed.setDescription(historyText);
    return embed;
}

module.exports = {
    createGameEmbed,
    createPokerEmbed,
    createSlotsEmbed,
    createBlackjackEmbed,
    createErrorEmbed,
    createSuccessEmbed,
    createInfoEmbed,
    createLeaderboardEmbed,
    createStatsEmbed,
    createHistoryEmbed
};