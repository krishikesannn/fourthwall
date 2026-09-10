-- Recurring studio booking hours. Times are interpreted in the configured studio timezone.
create table if not exists studio_availability (
  id text primary key,
  weekday integer not null check (weekday between 0 and 6),
  start_time text not null,
  end_time text not null,
  active integer not null default 1 check (active in (0,1)),
  created_by text references users(id),
  created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp,
  unique(weekday,start_time,end_time)
);

insert or ignore into studio_availability(id,weekday,start_time,end_time)
values
 ('availability-monday',1,'10:00','18:00'),
 ('availability-tuesday',2,'10:00','18:00'),
 ('availability-wednesday',3,'10:00','18:00'),
 ('availability-thursday',4,'10:00','18:00'),
 ('availability-friday',5,'10:00','18:00');

create index if not exists meetings_start_idx on meetings(starts_at,status);
