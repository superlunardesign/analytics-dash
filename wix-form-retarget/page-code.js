// ============================================================
// PAGE CODE — paste into the page that contains your form
// (In Wix Studio: select the page → Code panel at bottom)
// ============================================================
//
// SETUP: Replace the element IDs below (#emailInput, #nameInput)
// with the actual IDs of your form's email and name input fields.
// To find them: click the input in the editor → see its ID in
// the Properties panel (right side). If using Wix Forms, you may
// need to switch to custom input elements for onBlur access.
//
// This code captures the email (and optionally name) when the
// visitor clicks/tabs away from the field. It waits 3 seconds
// to confirm the visitor didn't immediately come back to edit,
// then sends the data to a backend function for storage.

import { captureAbandonedLead, markFormSubmitted } from 'backend/abandonedLeads.web';

let emailTimer;
let nameTimer;
let capturedEmail = '';
let capturedName = '';
let sessionId = '';

$w.onReady(function () {
    sessionId = generateSessionId();

    // --- EMAIL FIELD: capture on blur with 3-second debounce ---
    $w('#emailInput').onBlur(() => {
        clearTimeout(emailTimer);
        const email = $w('#emailInput').value.trim();

        if (!isValidEmail(email)) return;

        emailTimer = setTimeout(() => {
            capturedEmail = email;
            captureAbandonedLead({
                email: capturedEmail,
                name: capturedName,
                sessionId: sessionId
            });
        }, 3000);
    });

    // Cancel the timer if they come back to edit
    $w('#emailInput').onFocus(() => {
        clearTimeout(emailTimer);
    });

    // --- NAME FIELD (optional): same pattern ---
    $w('#nameInput').onBlur(() => {
        clearTimeout(nameTimer);
        const name = $w('#nameInput').value.trim();

        if (!name || name.length < 2) return;

        nameTimer = setTimeout(() => {
            capturedName = name;
            if (capturedEmail) {
                captureAbandonedLead({
                    email: capturedEmail,
                    name: capturedName,
                    sessionId: sessionId
                });
            }
        }, 3000);
    });

    $w('#nameInput').onFocus(() => {
        clearTimeout(nameTimer);
    });

    // --- FORM SUBMIT: mark as completed so the retarget email is suppressed ---
    $w('#submitButton').onClick(() => {
        if (capturedEmail) {
            markFormSubmitted({ sessionId: sessionId, email: capturedEmail });
        }
    });
});

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function generateSessionId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}
