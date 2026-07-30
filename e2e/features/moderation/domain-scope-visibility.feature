# DOMAIN VISIBILITY MATRIX — the READ side of the bff's domain-scope chain,
# previously untested (the seed catalogue defined streamer-b / admin-domain-b
# for exactly this and barely used them). Moderation lists are STRICTLY
# domain-pinned (OwncastModerationService: moderatorDomain == validated issuer,
# NO superadmin all-brands bypass), while the superadmin active-grants list
# (/bff/owncast/superadmin/access) is deliberately UNSCOPED — the one
# cross-brand read surface.
#
# STACK REQUIREMENT: this feature is only meaningful on the MULTI-BRAND
# (multi-issuer) e2e stack where domain-a and domain-b are distinct brands
# (app.tenancy.issuers configured; streamer-a/mod-a/admin-domain-a log in via
# brand A's Casdoor, streamer-b/admin-domain-b via brand B's). On a
# single-issuer stack every principal folds into the `default` domain and the
# NOT-see assertions cannot hold — run this feature only against the
# multi-brand overlay.
#
# HONESTY: victim-creates-first — BOTH streamers create their own streams (real
# sessions, real writes) before any list is read, so the absence assertion is a
# real scoping proof, not an empty-table artefact; each absence check follows a
# presence check on the same settled list.
#
# @cluster — drives a LIVE multi-brand stack; config filters `not @cluster`.
@cluster @owncast-ui @multiuser
Feature: Domain scope visibility — moderation lists are brand-pinned, superadmin grants span brands
  As the owncast platform
  I want moderation reads pinned to the moderator's brand
  So that one brand's staff cannot even see another brand's streams

  Scenario: a mod sees only their own brand's streams in the moderation list
    # Both victims create their streams first — the absence below is scoping,
    # not an unpopulated table.
    Given "streamer-a" signs in with a real Casdoor session
    When "streamer-a" navigates to "/owncast/stream"
    And "streamer-a" sets their stream details to title "Brand A stream" and description "Visible to brand A staff only" and saves
    Given "streamer-b" signs in with a real Casdoor session
    When "streamer-b" navigates to "/owncast/stream"
    And "streamer-b" sets their stream details to title "Brand B stream" and description "Visible to brand B staff only" and saves
    # Brand A's mod: sees the brand-A stream, NOT the brand-B one.
    Given "mod-a" signs in with a real Casdoor session
    When "mod-a" navigates to "/owncast/moderation"
    Then "mod-a" sees a moderation row for "google:streamer-a@example.test"
    And "mod-a" does not see a moderation row for "discord:streamer-b@example.test"
    # Symmetric: brand B's admin (inheriting moderation) sees only brand B.
    Given "admin-domain-b" signs in with a real Casdoor session
    When "admin-domain-b" navigates to "/owncast/moderation"
    Then "admin-domain-b" sees a moderation row for "discord:streamer-b@example.test"
    And "admin-domain-b" does not see a moderation row for "google:streamer-a@example.test"

  Scenario: the superadmin active-grants list shows grants across brands
    # Each scoped admin grants inside their OWN brand (a scoped admin's write is
    # always stamped with their issuer-derived domain).
    Given "admin-domain-a" signs in with a real Casdoor session
    And "admin-domain-a" has cleared broadcast overrides for "google:streamer-a@example.test"
    Given "admin-domain-b" signs in with a real Casdoor session
    And "admin-domain-b" has cleared broadcast overrides for "discord:streamer-b@example.test"
    When "admin-domain-a" navigates to "/owncast/grants"
    And "admin-domain-a" grants broadcast to "google:streamer-a@example.test"
    Then "admin-domain-a" sees the applied result for "google:streamer-a@example.test" with type "broadcast"
    When "admin-domain-b" navigates to "/owncast/grants"
    And "admin-domain-b" grants broadcast to "discord:streamer-b@example.test"
    Then "admin-domain-b" sees the applied result for "discord:streamer-b@example.test" with type "broadcast"
    # The superadmin list-active read is UNSCOPED: one list, both brands' rows.
    Given "superadmin" signs in with a real Casdoor session
    When "superadmin" navigates to "/owncast/grants"
    Then "superadmin" sees the active-grants panel
    And "superadmin" sees an active-grant row for "google:streamer-a@example.test"
    And "superadmin" sees an active-grant row for "discord:streamer-b@example.test"
