# GRANTS FORM VALIDATION + AUDIT HISTORY — the last uncovered corners of the
# grants console: client-side validation (aria-invalid + the exact inline
# errors, and NO request/result), and the superadmin history lookup proving the
# UI copy's "recorded for audit" claim with REAL active AND revoked rows.
#
# HONESTY SPLIT: the two validation scenarios use seeded sessions because the
# invalid form NEVER fires a request (submit() returns before the client call —
# pure client-side behaviour); every assertion is exact-text and the
# no-result-panel absence check runs only AFTER the visible error proves the
# view settled. The history round-trip uses REAL Casdoor sessions (grant / ban /
# restore are real writes) and builds its own audit trail inside the scenario:
# the admin grants, bans, then lifts the ban — so the superadmin's history read
# must show the still-active broadcast grant AND the revoked ban row.
#
# @cluster — needs the host shell serving the remote (and a live bff + Casdoor
# for the history scenario); config filters `not @cluster`.
@cluster @owncast-ui @multiuser
Feature: Grants form validation and audit history
  As a broadcast-governance admin
  I want invalid submissions stopped client-side and every change auditable
  So that no malformed grant fires and history explains who did what

  Scenario: submitting without a user subject shows the inline error and applies nothing
    Given "admin-domain-a" has a seeded session
    When "admin-domain-a" navigates to "/owncast/grants"
    And "admin-domain-a" submits the grant form without filling the user subject
    Then "admin-domain-a" sees the user-subject validation error
    And "admin-domain-a" sees no applied result panel

  Scenario: a non-positive timeout duration shows the inline error and applies nothing
    Given "admin-domain-a" has a seeded session
    When "admin-domain-a" navigates to "/owncast/grants"
    And "admin-domain-a" submits a timeout for "google:streamer-a@example.test" with 0 hours
    Then "admin-domain-a" sees the timeout-hours validation error
    And "admin-domain-a" sees no applied result panel

  Scenario: grant, ban and restore leave an audit trail the superadmin history shows
    Given "admin-domain-a" signs in with a real Casdoor session
    And "admin-domain-a" has cleared broadcast overrides for "google:streamer-a@example.test"
    # Build the audit trail with real writes through the real console.
    When "admin-domain-a" navigates to "/owncast/grants"
    And "admin-domain-a" grants broadcast to "google:streamer-a@example.test"
    Then "admin-domain-a" sees the applied result for "google:streamer-a@example.test" with type "broadcast"
    When "admin-domain-a" bans "google:streamer-a@example.test" from broadcast
    Then "admin-domain-a" sees the ban-precedence note
    And "admin-domain-a" sees the applied result for "google:streamer-a@example.test" with type "banned"
    # The result panel's contextual action for a ban is Restore (lift ban).
    When "admin-domain-a" restores from the result panel
    Then "admin-domain-a" sees the grants notice "Ban lifted for google:streamer-a@example.test — broadcast restored."
    # The superadmin's unscoped history read shows BOTH: the broadcast grant
    # still active, and the ban row retained as revoked (rows are never
    # hard-deleted — the audit-trail contract).
    Given "superadmin" signs in with a real Casdoor session
    When "superadmin" navigates to "/owncast/grants"
    And "superadmin" looks up the grant history for "google:streamer-a@example.test"
    Then "superadmin" sees a history row of type "broadcast" in state "active"
    And "superadmin" sees a history row of type "banned" in state "revoked"
