/**
 * Pacing for the blackjack table, in milliseconds.
 *
 * These are deliberately in one place: the dealer's cards used to appear
 * almost instantly once the player stood, because the hole card was flipped in
 * the same message edit as the player's action and the result frame followed
 * the last dealer card with no pause at all. Keeping the values together makes
 * the rhythm of a hand easy to read and to tune.
 */
module.exports = {
    // Between each card of the opening deal.
    INITIAL_DEAL_DELAY: 900,

    // Beat after the player finishes, before the hole card is turned over.
    DEALER_REVEAL_DELAY: 1300,

    // Between each card the dealer draws to itself.
    DEALER_DRAW_DELAY: 1400,

    // Beat after the dealer's final card, before results and payouts show.
    DEALER_RESULT_DELAY: 900
};
