-- Built-in recipient groups become: Everyone, Jazz Band, Concert/Marching Band.
-- "Jazz" is renamed; "Marching" + "Concert" are merged into one group. Every
-- statement is guarded so the migration is safe to re-run on a partially
-- migrated database.

-- 1. Make sure the new groups exist (adopt a same-named custom group if present).
INSERT INTO "Group" ("id", "name", "builtIn", "createdAt")
SELECT 'grp_jazz_band', 'Jazz Band', true, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Group" WHERE "name" = 'Jazz Band');
UPDATE "Group" SET "builtIn" = true WHERE "name" = 'Jazz Band';

INSERT INTO "Group" ("id", "name", "builtIn", "createdAt")
SELECT 'grp_concert_marching', 'Concert/Marching Band', true, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Group" WHERE "name" = 'Concert/Marching Band');
UPDATE "Group" SET "builtIn" = true WHERE "name" = 'Concert/Marching Band';

-- 2. Move contact memberships from the old groups to the new ones.
INSERT INTO "ContactGroup" ("contactId", "groupId")
SELECT DISTINCT cg."contactId", (SELECT "id" FROM "Group" WHERE "name" = 'Jazz Band')
FROM "ContactGroup" cg JOIN "Group" g ON g."id" = cg."groupId"
WHERE g."name" = 'Jazz'
ON CONFLICT DO NOTHING;

INSERT INTO "ContactGroup" ("contactId", "groupId")
SELECT DISTINCT cg."contactId", (SELECT "id" FROM "Group" WHERE "name" = 'Concert/Marching Band')
FROM "ContactGroup" cg JOIN "Group" g ON g."id" = cg."groupId"
WHERE g."name" IN ('Marching', 'Concert')
ON CONFLICT DO NOTHING;

-- 3. Keep announcement history pointing at a group that still exists.
INSERT INTO "AnnouncementRecipientGroup" ("announcementId", "groupId")
SELECT DISTINCT arg."announcementId", (SELECT "id" FROM "Group" WHERE "name" = 'Jazz Band')
FROM "AnnouncementRecipientGroup" arg JOIN "Group" g ON g."id" = arg."groupId"
WHERE g."name" = 'Jazz'
ON CONFLICT DO NOTHING;

INSERT INTO "AnnouncementRecipientGroup" ("announcementId", "groupId")
SELECT DISTINCT arg."announcementId", (SELECT "id" FROM "Group" WHERE "name" = 'Concert/Marching Band')
FROM "AnnouncementRecipientGroup" arg JOIN "Group" g ON g."id" = arg."groupId"
WHERE g."name" IN ('Marching', 'Concert')
ON CONFLICT DO NOTHING;

-- 4. Drop the old built-ins (memberships + announcement links cascade).
DELETE FROM "Group" WHERE "name" IN ('Jazz', 'Marching', 'Concert') AND "builtIn" = true;
