\set ON_ERROR_STOP on
-- Required psql variables: repair_key, kind, args (JSON), expected (SHA-256), evidence.
-- Optional apply defaults to false. SQL literal quoting keeps all inputs data, not SQL.
\if :{?apply}
\else
  \set apply false
\endif
\if :apply
  begin;
\else
  begin transaction isolation level repeatable read read only;
\endif
select maintenance.repair(:'repair_key', :'kind', :'args'::jsonb, :'expected', :'evidence', not :'apply'::boolean);
commit;
