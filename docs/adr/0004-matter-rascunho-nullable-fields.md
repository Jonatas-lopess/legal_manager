# `rascunho` matters allow null `client_id` and catalog item

A `matter` normally requires `client_id` and a catalog-item reference. The `rascunho` status relaxes both to nullable at the database level, not just hidden/optional in the UI — a matter can be started before the client or catalog item is picked, and must gain both before it can move to `em_andamento`. Enforced at the DB level (not just app validation) so the constraint can't be silently bypassed by a future direct write. Without this, `rascunho` would be a label with no behavioral difference from `em_andamento`.
