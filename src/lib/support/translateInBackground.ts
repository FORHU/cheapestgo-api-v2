import { logger } from '@/lib/logger';
import { publish } from '@/lib/support/events';
import { SupportRepository } from '@/repositories/support.repository';
import {
    planTranslation,
    translate,
    translationConfigured,
    AGENT_LANG,
    type SupportLang,
} from '@/lib/support/translation';

/**
 * Render a message in the other party's language, after it has been delivered.
 *
 * Deliberately not awaited by the request that wrote the message. Translation is a call to
 * another machine that ADR-0034 records as often failing, and a customer's message must appear
 * the moment they send it whether or not anything can be made of it in English. So the message
 * is stored, delivered and announced first; the rendering catches up and is announced again.
 *
 * The row's `translation_status` is the state the reader watches: `pending` the moment a
 * rendering is asked for, then `translated` or `untranslated`. Both settles are conditional on
 * it still being `pending`, so a second run of the same message cannot overwrite the first.
 *
 * Nothing here throws. A message that arrived untranslated is a message; a message lost because
 * its translation failed is not.
 */
export async function translateInBackground(input: {
    messageId:      string;
    conversationId: string;
    senderType:     string;
    body:           string;
    customerLang:   SupportLang;
    repo?:          SupportRepository;
}): Promise<void> {
    const repo = input.repo ?? new SupportRepository();

    const target = planTranslation(input.senderType, input.body, input.customerLang);
    // Nothing to do: both parties already read this one. The status stays null, which is what
    // "never needed one" looks like — distinct from a rendering that was tried and refused.
    if (!target) return;

    try {
        // Before the call, so a reader holding the stream sees it is being worked on rather
        // than a message that silently changes under them a few seconds later.
        await repo.markTranslationPending(input.messageId, target);
        await publish({ conversationId: input.conversationId, messageId: input.messageId });

        if (!translationConfigured()) {
            await repo.settleUntranslated(input.messageId);
            await publish({ conversationId: input.conversationId, messageId: input.messageId });
            return;
        }

        const rendered = await translate(input.body, target);

        // A refused or unusable reply settles as `untranslated`, never as a rendering: the
        // original still has to be shown, and the reader is entitled to know why.
        const landed = rendered
            ? await repo.settleTranslated(input.messageId, rendered, target)
            : (await repo.settleUntranslated(input.messageId), false);

        // Told again, because the message on screen has changed even though nothing was
        // written to the conversation.
        await publish({ conversationId: input.conversationId, messageId: input.messageId });

        // After the customer has their reply, never before: the back-translation is for the
        // Agent, so the Agent can see what the customer actually read, and the customer's wait
        // must not include it.
        if (landed && rendered && input.senderType === 'agent' && target !== AGENT_LANG) {
            await storeBackTranslation(repo, input.messageId, input.conversationId, rendered);
        }
    } catch (err) {
        logger.warn('[support/translate] failed', { err: (err as Error).message, messageId: input.messageId });
        // A row left pending is one the reader waits on forever, so it is settled even here.
        await repo.settleUntranslated(input.messageId).catch(() => {});
        await publish({ conversationId: input.conversationId, messageId: input.messageId }).catch(() => {});
    }
}

/**
 * Its own try: failing here must not touch the forward translation, which was delivered and is
 * correct as far as anyone can tell. A failure is stored as '' — "could not check" — so the
 * inbox stops saying it is checking.
 */
async function storeBackTranslation(
    repo: SupportRepository,
    messageId: string,
    conversationId: string,
    translated: string,
): Promise<void> {
    try {
        const back = await translate(translated, AGENT_LANG);
        await repo.storeBackTranslation(messageId, back ?? '');
        await publish({ conversationId, messageId });
    } catch (err) {
        logger.warn('[support/translate] back-translation failed', { err: (err as Error).message, messageId });
        await repo.storeBackTranslation(messageId, '').catch(() => {});
    }
}
