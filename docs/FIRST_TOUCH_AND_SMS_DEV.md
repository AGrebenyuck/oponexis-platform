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
