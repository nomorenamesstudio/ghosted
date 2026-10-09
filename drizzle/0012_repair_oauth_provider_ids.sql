-- Identity rows written before 1.3.0 were keyed on `user.id`, which @auth/core
-- fills with a fresh `crypto.randomUUID()` on every sign-in and never with the
-- provider's own id (that lives in `account.providerAccountId`). Every row this
-- table was backfilled with therefore points at nothing and can never match
-- again — and left in place, each future sign-in would add another one.
--
-- The accounts keep their links: a returning member is matched by verified
-- email instead, and that sign-in writes one row keyed on the provider's real
-- subject id. Nothing else reads this column.
--
-- Detection is exact rather than fuzzy: Auth.js generates a v4 UUID, so the
-- version and variant nibbles are checked too. Google's subject ids are numeric
-- and LinkedIn's are short opaque strings — neither can be shaped like this.
DELETE FROM "oauth_accounts"
WHERE "provider_id" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
