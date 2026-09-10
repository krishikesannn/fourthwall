-- Reusable service/pricing blocks for the branded proposal builder.
create table if not exists proposal_service_templates (
  id text primary key,
  title text not null,
  description text,
  amount integer not null default 0,
  currency text not null default 'INR',
  active integer not null default 1 check(active in (0,1)),
  created_by text references users(id) on delete set null,
  created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp
);

insert or ignore into proposal_service_templates(id,title,description,amount,currency)
values
 ('service-brand-strategy','Brand strategy','Positioning, audience definition and a clear strategic direction.',7500000,'INR'),
 ('service-visual-identity','Visual identity','Logo system, typography, colour palette and practical brand guidelines.',12500000,'INR'),
 ('service-editorial-website','Editorial website','Responsive design and development for a distinctive digital presence.',18000000,'INR');
