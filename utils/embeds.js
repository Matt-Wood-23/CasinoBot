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
    } else if (game.constructor.name === 'RouletteGame') {
        return await createRouletteEmbed(game, userId);
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

async function createRouletteEmbed(game, userId) {
    const userData = getUserData(userId);
    const userMoney = userData ? userData.money : 500;
    
    const embed = new EmbedBuilder()
        .setTitle('🎰 American Roulette')
        .setColor(game.totalWinnings > 0 ? '#00FF00' : '#FF0000');
    
    if (game.gameComplete) {
        // Create the roulette table layout
        const tableLayout = createRouletteTableLayout(game.winningNumber);
        
        // Show the winning number prominently with animation effect
        const winningDisplay = getWinningNumberWithAnimation(game.winningNumber, game.winningColor);
        
        embed.setDescription(`${winningDisplay}\n\n${tableLayout}`);
        
        // Show bet results in a clean format
        let resultsText = '';
        let totalBet = 0;
        let totalWon = 0;
        
        const sortedResults = game.results.sort((a, b) => {
            // Sort winning bets first, then by bet amount descending
            if (a.won && !b.won) return -1;
            if (!a.won && b.won) return 1;
            return b.betAmount - a.betAmount;
        });
        
        for (const result of sortedResults) {
            totalBet += result.betAmount;
            if (result.won) totalWon += result.winnings;
            
            const status = result.won ? '🎉' : '💸';
            const payout = result.won ? ` (${result.payout}:1 = +${result.winnings})` : '';
            resultsText += `${status} **${game.getBetTypeDisplayName(result.betType)}**: ${result.betAmount}${payout}\n`;
        }
        
        embed.addFields({
            name: '📊 Your Bets & Results',
            value: resultsText,
            inline: false
        });
        
        // Show financial summary with better formatting
        const netResult = game.totalWinnings - totalBet;
        const netEmoji = netResult > 0 ? '📈' : netResult < 0 ? '📉' : '➖';
        
        embed.addFields(
            {
                name: '💰 Total Wagered',
                value: `${totalBet.toLocaleString()}`,
                inline: true
            },
            {
                name: '🎉 Total Won',
                value: `${game.totalWinnings.toLocaleString()}`,
                inline: true
            },
            {
                name: `${netEmoji} Net Result`,
                value: `${netResult >= 0 ? '+' : ''}${netResult.toLocaleString()}`,
                inline: true
            }
        );
        
        embed.addFields({
            name: '💵 Current Balance',
            value: `${userMoney.toLocaleString()}`,
            inline: false
        });
        
        // Add flavor text based on results
        if (game.totalWinnings > totalBet * 5) {
            embed.addFields({
                name: '🎊 INCREDIBLE WIN!',
                value: 'Lady Luck is definitely on your side tonight!',
                inline: false
            });
        } else if (game.totalWinnings > totalBet) {
            embed.addFields({
                name: '🎉 Winner!',
                value: 'Nice spin! The wheel favored you this time.',
                inline: false
            });
        } else if (game.totalWinnings === 0) {
            embed.addFields({
                name: '🎲 House Wins',
                value: 'Better luck next spin! The house always has an edge.',
                inline: false
            });
        } else {
            embed.addFields({
                name: '🎯 Close One!',
                value: 'You got some winnings back! Try your luck again.',
                inline: false
            });
        }
    }
    
    return embed;
}

// Helper function to create the roulette wheel display
function createRouletteTableLayout(winningNumber) {
    // American roulette wheel order (actual wheel sequence)
    const wheelOrder = [
        0, 28, 9, 26, 30, 11, 7, 20, 32, 17, 5, 22, 34, 15, 3, 24, 36, 13, 1,
        '00', 27, 10, 25, 29, 12, 8, 19, 31, 18, 6, 21, 33, 16, 4, 23, 35, 14, 2
    ];

    const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];

    // Find the winning number index
    const winningIndex = wheelOrder.findIndex(n => n.toString() === winningNumber.toString());

    let layout = '```\n';
    layout += '           🎰 ROULETTE WHEEL 🎰\n\n';
    layout += '                   ↓ BALL\n';
    layout += '      ┌─────────────────────────────┐\n';

    // Show 5 numbers at a time - 2 before, winner, 2 after
    const startIdx = (winningIndex - 2 + wheelOrder.length) % wheelOrder.length;

    for (let i = 0; i < 5; i++) {
        const idx = (startIdx + i) % wheelOrder.length;
        const num = wheelOrder[idx];
        const isWinner = idx === winningIndex;
        const numStr = num.toString().padStart(2, ' ');

        let color = '🟢';
        if (num !== 0 && num !== '00') {
            color = redNumbers.includes(num) ? '🔴' : '⚫';
        }

        if (isWinner) {
            layout += `      │          ${color} [${numStr}] ⭐          │\n`;
        } else {
            layout += `      │            ${color}  ${numStr}             │\n`;
        }
    }

    layout += '      └─────────────────────────────┘\n';
    layout += '```';

    return layout;
}

// Helper function for winning number display with animation
function getWinningNumberWithAnimation(winningNumber, winningColor) {
    const colorEmojis = {
        'red': '🔴',
        'black': '⚫',
        'green': '🟢'
    };
    
    const colorEmoji = colorEmojis[winningColor] || '⚪';
    const sparkles = '✨🎉✨';
    
    return `${sparkles} **WINNING NUMBER** ${sparkles}\n` +
           `# ${colorEmoji} ${winningNumber} ${colorEmoji}\n` +
           `*The ball landed on ${winningColor} ${winningNumber}*`;
}

// Enhanced bet type display names
function getBetTypeDisplayName(betType) {
    const displayNames = {
        'red': '🔴 Red Numbers',
        'black': '⚫ Black Numbers', 
        'green': '🟢 Green (0/00)',
        'odd': '🔢 Odd Numbers',
        'even': '🔢 Even Numbers',
        'low': '📉 Low (1-18)',
        'high': '📈 High (19-36)',
        '1st12': '1️⃣ First Dozen (1-12)',
        '2nd12': '2️⃣ Second Dozen (13-24)',
        '3rd12': '3️⃣ Third Dozen (25-36)',
        'col1': '🔢 Column 1 (1,4,7...)',
        'col2': '🔢 Column 2 (2,5,8...)',
        'col3': '🔢 Column 3 (3,6,9...)'
    };
    
    // Check if it's a straight number bet
    const num = parseInt(betType);
    if (!isNaN(num) || betType === '00') {
        if (betType === '0') return '🟢 Straight 0';
        if (betType === '00') return '🟢 Straight 00';
        
        const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
        if (redNumbers.includes(num)) return `🔴 Straight ${betType}`;
        return `⚫ Straight ${betType}`;
    }
    
    return displayNames[betType] || `🎯 ${betType}`;
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
    const rouletteWinRate = stats.rouletteSpins > 0 ? ((stats.rouletteWins / stats.rouletteSpins) * 100).toFixed(1) : 0;
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
            { name: '🎁 Gifts Sent', value: `${(userData.giftsSent || 0).toLocaleString()} (${(userData.totalGiftsSent || 0).toLocaleString()})`, inline: true },
            { name: '🎀 Gifts Received', value: `${(userData.giftsReceived || 0).toLocaleString()} (${(userData.totalGiftsReceived || 0).toLocaleString()})`, inline: true },
            { name: '💳 Current Balance', value: `${(userData.money || 0).toLocaleString()}`, inline: true },
            { name: '🎰 Roulette Spins', value: (stats.rouletteSpins || 0).toLocaleString(), inline: true },
            { name: '🎰 Roulette Wins', value: (stats.rouletteWins || 0).toLocaleString(), inline: true },
            { name: '📈 Roulette Win Rate', value: `${rouletteWinRate}%`, inline: true },
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
    createRouletteEmbed,
    createBlackjackEmbed,
    createErrorEmbed,
    createSuccessEmbed,
    createInfoEmbed,
    createLeaderboardEmbed,
    createStatsEmbed,
    createHistoryEmbed
};