begin;

-- Aureon Base v0.7: strict project + environment isolation for generic records.

insert into project_environments(project_id,name)
select p.id, env.name
from projects p
cross join (values ('development'),('preview'),('production')) env(name)
on conflict(project_id,name) do nothing;

alter table project_records
  add column if not exists environment_id uuid;

update project_records r
set environment_id = e.id
from project_environments e
where r.environment_id is null
  and e.project_id = r.project_id
  and e.name = 'production';

create unique index if not exists uq_project_environments_project_id_id
  on project_environments(project_id,id);

alter table project_records
  drop constraint if exists project_records_project_environment_fk;

alter table project_records
  add constraint project_records_project_environment_fk
  foreign key(project_id,environment_id)
  references project_environments(project_id,id)
  on delete cascade;

alter table project_records
  alter column environment_id set not null;

create index if not exists idx_project_records_environment_collection_time
  on project_records(project_id,environment_id,collection,created_at desc);

create index if not exists idx_project_records_environment_owner_time
  on project_records(project_id,environment_id,collection,owner_user_id,created_at desc);

commit;
