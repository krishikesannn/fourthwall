-- Phase 7 operational reminders: prevent duplicate CRM renewal notifications.
alter table client_contacts add column renewal_reminder_sent_at text;
create index if not exists contacts_renewal_pending_idx
  on client_contacts(renewal_at, renewal_reminder_sent_at);
