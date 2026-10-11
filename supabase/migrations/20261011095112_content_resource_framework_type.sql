-- Content Bank: allow "framework" as a Content Resource type.
--
-- The product specification lists framework among the lead-magnet subtypes and the
-- Content Bank schema already validates it, but the database check only allowed
-- seven types, so a framework could not be saved. This widens the check; every
-- existing row already satisfies it, so no data is read, rewritten or removed.
--
-- The constraint is replaced in one ALTER statement, so there is no moment at
-- which the table is unconstrained. Forward-only and rerunnable. Deploy this
-- schema before the application release that offers the type; the previously
-- deployed application never submits it. Rollback: restore the previous seven-type
-- check only while no resource has resource_type = 'framework' (see
-- docs/content-resource-framework-type.md).

alter table public.content_resources
  drop constraint if exists content_resources_type_check,
  add constraint content_resources_type_check
    check (
      resource_type in (
        'guide',
        'template',
        'checklist',
        'framework',
        'report',
        'worksheet',
        'tool',
        'other'
      )
    );
