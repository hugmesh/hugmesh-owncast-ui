# SUPERADMIN BROADCAST-GUARD EXEMPTION — the bff documents SUPERADMIN as exempt
# from OwncastBroadcastGuard (an active grant AND NOT an active ban, SUPERADMIN
# exempt). The UI has no status endpoint, so it fail-closed-disables the public
# option for EVERYONE until a flip succeeds — including a superadmin with no
# grant. This scenario pins both halves: the wrongly-conservative disabled state
# renders first, and the "Try going public" probe is exactly how the UI recovers
# from it — the superadmin's flip succeeds with NO grant on file.
#
# HONESTY: a REAL Casdoor session (the visibility PUT is a real write) and the
# no-grant precondition is pinned by real idempotent revokes (the superadmin
# clears their own overrides), not assumed from a virgin database.
#
# @cluster — drives a LIVE host shell + owncast-bff + Casdoor; config filters
# `not @cluster`.
@cluster @owncast-ui
Feature: Superadmin exemption — a superadmin goes public with no broadcast grant
  As a superadmin
  I want my own stream to go public without a broadcast grant
  So that the platform operator is never locked out of their own surface

  Scenario: the fail-closed gate renders, then the try-public probe succeeds grant-free
    Given "superadmin" signs in with a real Casdoor session
    # Pin the no-grant default-deny state for the superadmin's own subject.
    And "superadmin" has cleared broadcast overrides for "google:superadmin@example.test"
    When "superadmin" navigates to "/owncast/stream"
    And "superadmin" sets their stream details to title "Operator stream" and description "Superadmin guard exemption" and saves
    And "superadmin" resets their own stream visibility to internal
    And "superadmin" reloads their stream console
    Then "superadmin" sees current visibility "internal"
    # The UI cannot know about the exemption, so it fail-closed-disables public
    # (with the canonical helptext) even for the superadmin…
    And "superadmin" sees the public-visibility option disabled
    And "superadmin" sees the broadcast-gate helptext
    # …and the probe is the recovery path: the LIVE guard exempts SUPERADMIN,
    # so the flip succeeds with no grant on file.
    When "superadmin" tries going public
    Then "superadmin" sees the flip notice "Your stream is now public."
    And "superadmin" sees current visibility "public"
    And "superadmin" sees the public-visibility option enabled
