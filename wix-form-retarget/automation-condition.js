// ============================================================
// AUTOMATION CONDITION CHECK — save as: backend/checkAbandoned.web.js
// ============================================================
//
// This is an OPTIONAL helper if you want to double-check
// from a second automation step whether the form was submitted.
// The simpler approach is to use the automation builder's
// built-in condition on the CMS data (see SETUP-GUIDE.md).

import { Permissions, webMethod } from 'wix-web-module';
import { items } from '@wix/data';

const COLLECTION = 'AbandonedLeads';

export const isFormStillAbandoned = webMethod(
    Permissions.Admin,
    async ({ sessionId }) => {
        try {
            const result = await items.query(COLLECTION)
                .eq('sessionId', sessionId)
                .eq('formSubmitted', false)
                .find();

            return { abandoned: result.items.length > 0 };
        } catch (err) {
            console.error('isFormStillAbandoned error:', err);
            return { abandoned: false };
        }
    }
);
