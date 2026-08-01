// ============================================================
// BACKEND WEB MODULE — save as: backend/abandonedLeads.web.js
// (In Wix Studio: Code Files panel → Backend → New .web.js file)
// ============================================================
//
// Web modules expose backend functions that page code can call.
// These run server-side with elevated permissions so visitors
// can write to your CMS collection without direct access.

import { Permissions, webMethod } from 'wix-web-module';
import { items } from '@wix/data';
import { customTrigger } from '@wix/automations';

const COLLECTION = 'AbandonedLeads';

export const captureAbandonedLead = webMethod(
    Permissions.Anyone,
    async ({ email, name, sessionId }) => {
        if (!email) return { success: false };

        try {
            const existing = await items.query(COLLECTION)
                .eq('sessionId', sessionId)
                .find();

            if (existing.items.length > 0) {
                await items.save(COLLECTION, {
                    ...existing.items[0],
                    email,
                    name: name || existing.items[0].name,
                    lastUpdated: new Date()
                });
            } else {
                await items.insert(COLLECTION, {
                    email,
                    name: name || '',
                    sessionId,
                    formSubmitted: false,
                    capturedAt: new Date(),
                    lastUpdated: new Date(),
                    retargetSent: false
                });

                // Fire the Velo custom trigger for Wix Automations.
                // The automation itself handles the delay + conditional email.
                // Replace TRIGGER_ID with the ID from your automation setup.
                await customTrigger.runTrigger({
                    triggerId: 'YOUR_TRIGGER_ID_HERE',
                    payload: {
                        email,
                        name: name || '',
                        sessionId
                    }
                });
            }

            return { success: true };
        } catch (err) {
            console.error('captureAbandonedLead error:', err);
            return { success: false };
        }
    }
);

export const markFormSubmitted = webMethod(
    Permissions.Anyone,
    async ({ sessionId, email }) => {
        try {
            const existing = await items.query(COLLECTION)
                .eq('sessionId', sessionId)
                .find();

            if (existing.items.length > 0) {
                await items.save(COLLECTION, {
                    ...existing.items[0],
                    formSubmitted: true,
                    submittedAt: new Date()
                });
            }

            return { success: true };
        } catch (err) {
            console.error('markFormSubmitted error:', err);
            return { success: false };
        }
    }
);
