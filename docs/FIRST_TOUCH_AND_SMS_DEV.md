# First-touch and SMS lifecycle (dev)

## Attribution

The public site captures the first browser visit once for 180 days. The lead payload contains bounded UTM source/medium/campaign/content/term, referrer, landing path and Google/Meta/TikTok/Microsoft click IDs. CRM stores those fields on `Lead` and derives the canonical `Customer.source`. Later visits do not overwrite the first touch.

Google Maps transitions should use tagged links such as `utm_source=google_maps&utm_medium=organic`; direct calls from a Maps listing have no browser evidence and remain a manual source.

## Booking form SMS

CRM owns the known/new-client templates and creates an opaque public token. The public URL contains only that token, not a phone number or customer name. New-client forms require a source; known customers reuse the CRM source.

Lifecycle states are `sending`, `pending`, `reminder_sending`, `reminded`, `done`, `expired`, `failed`, and `deleted`.

- after one hour: one SMS reminder;
- after two hours: the unconfirmed preliminary form slot expires;
- an already-created `WorkOrder` is never automatically deleted;
- expiry creates a Telegram lead-chat alert for manager follow-up.

For local development run CRM on port 3001 and start `npm run cron:sms-forms`. The poller calls `/api/cron/sms-form-reminders` every minute. Production scheduling is intentionally not configured in this dev milestone.

## SMS campaign test mode

By default, SMS campaigns include only customers with active marketing consent matching the selected phone. For an isolated database containing synthetic test contacts, set `SMS_CAMPAIGN_TEST_MODE=true` in the server environment to make the segments UI offer an explicit opt-in to include customers without active consent. The campaign records that test-mode choice in its filters, and both campaign and manual sends re-check the server flag before sending. Consent timestamps in customer records are never changed by this mode. Keep the flag off for real customer data.
