# REVOCATION MID-SESSION — the flip side of the grant lifecycle: removing the
# grant (or banning) flips the streamer back to fail-closed on their NEXT
# broadcast-affecting request, with no re-login. The second scenario pins the
# bff's documented ban>grant precedence from the VICTIM's perspective: the
# broadcast grant row stays active, yet the ban denies.
#
# HONESTY: real Casdoor sessions (revoke/ban are real writes); each scenario
# builds its OWN precondition (grant → public proven) before revoking it —
# victim-creates-first; exact notice/error texts throughout.
#
# @cluster — drives a LIVE stack; config filters `not @cluster`.
@cluster @owncast-ui @multiuser
Feature: Revocation mid-session — removing a grant or banning flips the streamer fail-closed
  As a domain admin
  I want a revoked or banned streamer denied on their next public flip
  So that broadcast access is live desired-state, not a login-time snapshot

  Scenario: removing the grant mid-session flips the streamer back to fail-closed
    Given "admin-domain-a" signs in with a real Casdoor session
    And "admin-domain-a" has cleared broadcast overrides for "google:streamer-a@example.test"
    Given "streamer-a" signs in with a real Casdoor session
    When "streamer-a" navigates to "/owncast/stream"
    And "streamer-a" sets their stream details to title "Revocation target" and description "Granted then revoked" and saves
    And "streamer-a" resets their own stream visibility to internal
    And "streamer-a" reloads their stream console
    # Build the precondition inside the scenario: grant, then PROVE it is live.
    When "admin-domain-a" navigates to "/owncast/grants"
    And "admin-domain-a" grants broadcast to "google:streamer-a@example.test"
    Then "admin-domain-a" sees the applied result for "google:streamer-a@example.test" with type "broadcast"
    When "streamer-a" tries going public
    Then "streamer-a" sees the flip notice "Your stream is now public."
    # Mid-session revocation from the result panel (DELETE .../broadcast/{user}).
    When "admin-domain-a" removes the grant from the result panel
    Then "admin-domain-a" sees the grants notice "Broadcast grant removed for google:streamer-a@example.test."
    # The streamer's next PUBLIC attempt hits the live guard: denied, and the UI
    # resets to the fail-closed disabled+helptext state.
    When "streamer-a" flips visibility to internal
    And "streamer-a" selects the public visibility option
    Then "streamer-a" sees the broadcast-denied flip error
    And "streamer-a" sees the public-visibility option disabled
    And "streamer-a" sees the broadcast-gate helptext

  Scenario: a ban denies broadcast even while the grant stays active (ban beats grant)
    Given "admin-domain-a" signs in with a real Casdoor session
    And "admin-domain-a" has cleared broadcast overrides for "google:streamer-a@example.test"
    Given "streamer-a" signs in with a real Casdoor session
    When "streamer-a" navigates to "/owncast/stream"
    And "streamer-a" sets their stream details to title "Ban precedence target" and description "Granted and banned" and saves
    And "streamer-a" resets their own stream visibility to internal
    And "streamer-a" reloads their stream console
    When "admin-domain-a" navigates to "/owncast/grants"
    And "admin-domain-a" grants broadcast to "google:streamer-a@example.test"
    Then "admin-domain-a" sees the applied result for "google:streamer-a@example.test" with type "broadcast"
    When "streamer-a" tries going public
    Then "streamer-a" sees the flip notice "Your stream is now public."
    # BAN while the broadcast grant is still active — the ban must win.
    When "admin-domain-a" bans "google:streamer-a@example.test" from broadcast
    Then "admin-domain-a" sees the ban-precedence note
    And "admin-domain-a" sees the applied result for "google:streamer-a@example.test" with type "banned"
    When "streamer-a" flips visibility to internal
    And "streamer-a" selects the public visibility option
    Then "streamer-a" sees the broadcast-denied flip error
    And "streamer-a" sees the public-visibility option disabled
