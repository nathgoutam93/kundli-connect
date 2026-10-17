-- Read-only report, with no writes even to maintenance tables. Run as an administrator
-- after installing maintenance/install.sql. Exports contain IDs, never message/profile text.
begin transaction isolation level repeatable read read only;
select issue,count(*) as candidates from maintenance.audit() group by issue order by issue;
select * from maintenance.audit() order by issue,entity_key;
commit;
