/**
 * Holiday Events System
 * Manages seasonal events with themed content and bonuses
 */

const HOLIDAYS = {
    halloween: {
        name: 'Halloween',
        emoji: '🎃',
        startMonth: 9,  // October (0-indexed)
        startDay: 25,
        endMonth: 9,
        endDay: 31,
        theme: {
            color: '#FF6600',
            accentColor: '#8B00FF',
            emojis: ['🎃', '👻', '🦇', '🕷️', '🕸️', '💀', '🧙'],
            prefix: '🎃 HALLOWEEN EVENT 🎃'
        },
        bonuses: {
            dailyMultiplier: 1.5,
            gameWinningsMultiplier: 1.25,
            workMultiplier: 1.3
        }
    },
    christmas: {
        name: 'Christmas',
        emoji: '🎄',
        startMonth: 11, // December (0-indexed)
        startDay: 19,
        endMonth: 11,
        endDay: 26,
        theme: {
            color: '#C41E3A',
            accentColor: '#0F8B4E',
            emojis: ['🎄', '🎅', '🎁', '⛄', '❄️', '🦌', '🔔'],
            prefix: '🎄 CHRISTMAS EVENT 🎄'
        },
        bonuses: {
            dailyMultiplier: 2.0,
            gameWinningsMultiplier: 1.5,
            workMultiplier: 1.5
        }
    }
};

/**
 * Check if a date falls within a holiday period
 */
function isDateInHoliday(date, holiday) {
    const month = date.getMonth();
    const day = date.getDate();

    // Handle holidays that span across months
    if (holiday.startMonth === holiday.endMonth) {
        return month === holiday.startMonth && day >= holiday.startDay && day <= holiday.endDay;
    } else {
        // Holiday spans across months (not currently used but future-proof)
        return (
            (month === holiday.startMonth && day >= holiday.startDay) ||
            (month === holiday.endMonth && day <= holiday.endDay) ||
            (month > holiday.startMonth && month < holiday.endMonth)
        );
    }
}

/**
 * Get the currently active holiday (if any)
 * @param {Date} date - Optional date to check (defaults to now)
 * @returns {Object|null} - Holiday object or null if no holiday is active
 */
function getCurrentHoliday(date = new Date()) {
    for (const [key, holiday] of Object.entries(HOLIDAYS)) {
        if (isDateInHoliday(date, holiday)) {
            return { id: key, ...holiday };
        }
    }
    return null;
}

/**
 * Check if a specific holiday is currently active
 */
function isHolidayActive(holidayId, date = new Date()) {
    const holiday = HOLIDAYS[holidayId];
    if (!holiday) return false;
    return isDateInHoliday(date, holiday);
}

/**
 * Get themed embed properties for the current holiday
 */
function getHolidayTheme(holidayId = null) {
    // If no holiday specified, check for current holiday
    if (!holidayId) {
        const currentHoliday = getCurrentHoliday();
        if (!currentHoliday) return null;
        holidayId = currentHoliday.id;
    }

    const holiday = HOLIDAYS[holidayId];
    if (!holiday) return null;

    return {
        color: holiday.theme.color,
        accentColor: holiday.theme.accentColor,
        emojis: holiday.theme.emojis,
        prefix: holiday.theme.prefix,
        name: holiday.name,
        emoji: holiday.emoji
    };
}

/**
 * Get bonus multiplier for a specific category
 */
function getHolidayMultiplier(category, holidayId = null) {
    if (!holidayId) {
        const currentHoliday = getCurrentHoliday();
        if (!currentHoliday) return 1.0;
        holidayId = currentHoliday.id;
    }

    const holiday = HOLIDAYS[holidayId];
    if (!holiday || !holiday.bonuses[category]) return 1.0;

    return holiday.bonuses[category];
}

/**
 * Get a random holiday-themed emoji
 */
function getRandomHolidayEmoji(holidayId = null) {
    const theme = getHolidayTheme(holidayId);
    if (!theme) return '';

    const emojis = theme.emojis;
    return emojis[Math.floor(Math.random() * emojis.length)];
}

/**
 * Apply holiday theme to an embed object
 */
function applyHolidayTheme(embed, holidayId = null) {
    const theme = getHolidayTheme(holidayId);
    if (!theme) return embed;

    // Update color
    if (embed.data && embed.data.color !== undefined) {
        embed.setColor(theme.color);
    } else {
        embed.setColor(theme.color);
    }

    // Add holiday prefix to title if it exists
    if (embed.data && embed.data.title) {
        const titleText = embed.data.title;
        // Only add prefix if it's not already there
        if (!titleText.includes('EVENT')) {
            const emoji = theme.emoji;
            embed.setTitle(`${emoji} ${titleText}`);
        }
    }

    // Add footer about the event
    const existingFooter = embed.data ? embed.data.footer : null;
    const eventText = `${theme.prefix} is active!`;

    if (existingFooter && existingFooter.text) {
        embed.setFooter({ text: `${existingFooter.text} | ${eventText}` });
    } else {
        embed.setFooter({ text: eventText });
    }

    return embed;
}

/**
 * Get holiday shop items
 */
function getHolidayShopItems(holidayId = null) {
    if (!holidayId) {
        const currentHoliday = getCurrentHoliday();
        if (!currentHoliday) return [];
        holidayId = currentHoliday.id;
    }

    const items = {
        halloween: [
            {
                id: 'trick_or_treat_bag',
                name: 'Trick or Treat Bag',
                emoji: '🎃',
                description: 'Random reward between 2x-10x the cost!',
                price: 3000,
                type: 'consumable'
            }
        ],
        christmas: [
            {
                id: 'santas_gift',
                name: "Santa's Gift",
                emoji: '🎁',
                description: 'Guaranteed win on your next game!',
                price: 5000,
                type: 'boost',
                boostType: 'santa_gift',
                boostValue: 100 // 100% win chance
            }
        ]
    };

    return items[holidayId] || [];
}

/**
 * Get holiday achievements
 */
function getHolidayAchievements(holidayId = null) {
    const achievements = {
        halloween: {
            id: 'spooky_winner',
            name: 'Spooky Winner',
            emoji: '👻',
            description: 'Win 50 games during Halloween',
            target: 50
        },
        christmas: {
            id: 'holiday_spirit',
            name: 'Holiday Spirit',
            emoji: '🎄',
            description: 'Claim daily bonus 7 days during Christmas',
            target: 7
        }
    };

    if (holidayId) {
        return achievements[holidayId] || null;
    }

    return achievements;
}

/**
 * Apply holiday bonus to game winnings (only positive winnings)
 * @param {number} winnings - The base winnings amount (can be negative for losses)
 * @returns {number} - Adjusted winnings with holiday multiplier applied
 */
function applyHolidayWinningsBonus(winnings) {
    // Only apply multiplier to positive winnings (actual wins)
    if (winnings <= 0) return winnings;

    const currentHoliday = getCurrentHoliday();
    if (!currentHoliday) return winnings;

    const multiplier = getHolidayMultiplier('gameWinningsMultiplier', currentHoliday.id);
    if (multiplier <= 1.0) return winnings;

    return Math.floor(winnings * multiplier);
}

/**
 * Format a holiday-themed message
 */
function getHolidayMessage(type, holidayId = null) {
    const theme = getHolidayTheme(holidayId);
    if (!theme) return null;

    const messages = {
        halloween: {
            welcome: `${theme.emoji} **Spooky Season is here!** ${theme.emoji}\n\nTrick or treat! Halloween bonuses are active:\n🎃 Daily bonuses: **+50%**\n👻 Game winnings: **+25%**\n🦇 Work earnings: **+30%**`,
            win: ['Spooktacular win!', 'Frightfully good!', 'Boo-tiful victory!', 'Hauntingly lucky!'],
            lose: ['Better luck next haunting!', 'The ghost got your coins!', 'Spooked out of luck!']
        },
        christmas: {
            welcome: `${theme.emoji} **Merry Christmas!** ${theme.emoji}\n\nSanta's bonuses are here:\n🎁 Daily bonuses: **+100%**\n⛄ Game winnings: **+50%**\n🦌 Work earnings: **+50%**`,
            win: ['Ho ho ho, big win!', 'Christmas miracle!', 'Santa blessed you!', 'Jingle all the way to the bank!'],
            lose: ['Naughty list!', 'Coal in your stocking!', 'Better luck next Christmas!']
        }
    };

    if (!holidayId) {
        const currentHoliday = getCurrentHoliday();
        if (!currentHoliday) return null;
        holidayId = currentHoliday.id;
    }

    const holidayMessages = messages[holidayId];
    if (!holidayMessages || !holidayMessages[type]) return null;

    // If it's an array, return a random message
    if (Array.isArray(holidayMessages[type])) {
        return holidayMessages[type][Math.floor(Math.random() * holidayMessages[type].length)];
    }

    return holidayMessages[type];
}

module.exports = {
    HOLIDAYS,
    getCurrentHoliday,
    isHolidayActive,
    getHolidayTheme,
    getHolidayMultiplier,
    getRandomHolidayEmoji,
    applyHolidayTheme,
    applyHolidayWinningsBonus,
    getHolidayShopItems,
    getHolidayAchievements,
    getHolidayMessage
};
