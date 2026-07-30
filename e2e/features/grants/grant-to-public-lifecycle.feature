# THE core multiuser journey of the owncast surface: an ADMIN grants broadcast
# and the STREAMER's public flip succeeds mid-session. Broadcast is default-deny
# + grant-only (OwncastBroadcastGuard), so this is the whole point of the grants
# console — and the transition OUT of the fail-closed disabled+helptext state is
# the UI contract under test.
#
# HONESTY: real Casdoor sessions in isolated contexts (the grant POST and the
# visibility PUT are real writes — a seeded localStorage session carries no bff
# cookie); victim-creates-first (the streamer creates + saves THEIR OWN stream
# before any admin action); the starting default-deny state is pinned by real
# idempotent revokes rather than assumed from a virgin database; every notice is
# asserted by exact text.
#
# @cluster — drives a LIVE host shell + owncast-bff + Casdoor; config filters
# `not @cluster`. bddgen still compiles + lists it.
@cluster @owncast-ui @multiuser
Feature: Grant-to-public lifecycle — an admin grants, the streamer goes public
  As a domain admin
  I want my broadcast grant to take effect for the streamer mid-session
  So that a streamer I trust can take their stream public without re-logging

  Scenario: an admin grant lets the streamer's public flip succeed mid-session
    Given "admin-domain-a" signs in with a real Casdoor session
    And "admin-domain-a" has cleared broadcast overrides for "google:streamer-a@example.test"
    # Victim-creates-first: the streamer owns their stream before the admin acts.
    Given "streamer-a" signs in with a real Casdoor session
    When "streamer-a" navigates to "/owncast/stream"
    And "streamer-a" sets their stream details to title "Streamer A goes live" and description "Live from brand A" and saves
    And "streamer-a" resets their own stream visibility to internal
    And "streamer-a" reloads their stream console
    # Save round-trip proof: the details survived a full reload.
    Then "streamer-a" sees stream details titled "Streamer A goes live" with description "Live from brand A"
    And "streamer-a" sees current visibility "internal"
    # The fail-closed gate, denied live by the real guard (not just the UI).
    And "streamer-a" sees the public-visibility option disabled
    And "streamer-a" sees the broadcast-gate helptext
    When "streamer-a" tries going public
    Then "streamer-a" sees the broadcast-denied flip error
    # The admin grants — a real write through the real console.
    When "admin-domain-a" navigates to "/owncast/grants"
    And "admin-domain-a" grants broadcast to "google:streamer-a@example.test"
    Then "admin-domain-a" sees the applied result for "google:streamer-a@example.test" with type "broadcast"
    # Mid-session, no re-login: the streamer's next probe now succeeds and the
    # UI transitions out of the fail-closed state.
    When "streamer-a" tries going public
    Then "streamer-a" sees the flip notice "Your stream is now public."
    And "streamer-a" sees current visibility "public"
    And "streamer-a" sees the public-visibility option enabled
