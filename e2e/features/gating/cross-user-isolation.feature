# CROSS-USER ISOLATION coverage — the owncast-bff is the authoritative gate; the
# console is defence-in-depth display only. Every scenario here signs in through
# the REAL Casdoor login (the HttpOnly `bff_` session cookie rides
# credentials:'include'), so a DENY is a genuine AUTHENTICATED role denial —
# exactly 403 from the bff SecurityConfig path gates / @PreAuthorize — and can
# never pass vacuously as an anonymous 401 (only the explicitly-unauthenticated
# scenario accepts a 401).
#
# Paths + bodies match the committed openapi.json contract exactly:
#   POST   /bff/owncast/admin/access/{grant|timeout|ban}    (JSON body)
#   GET    /bff/owncast/superadmin/access                   (list-active)
#   GET    /bff/owncast/mod/streams
#   GET    /bff/owncast/user/stream
# The POST bodies are well-formed grant requests, so the 403s are proven to be
# authorization denials, not validation artefacts. Cross-DOMAIN isolation is a
# different mechanism (a scoped admin's write lands inert in their OWN brand,
# not a 403) and is covered behaviourally in
# features/moderation/domain-scope-visibility.feature.
#
# @cluster — every scenario drives a LIVE bff + Casdoor, so all are dark; config
# filters `not @cluster`. bddgen still compiles + lists them.
@cluster @owncast-ui @cross-user
Feature: Cross-user isolation — the owncast-bff enforces the role gates server-side
  As the owncast platform
  I want every privileged owncast surface gated server-side
  So that a streamer cannot self-grant broadcast and no role reaches a higher surface

  Scenario: an unauthenticated client is rejected from the streamer surface
    When the unauthenticated client GETs "/bff/owncast/user/stream"
    Then the response status is one of 401 or 403

  Scenario: a streamer cannot call the admin grant endpoint (no self-grant)
    Given "streamer-a" signs in with a real Casdoor session
    When "streamer-a" navigates to "/owncast/stream"
    And "streamer-a" POSTs to "/bff/owncast/admin/access/grant" with body:
      """
      { "userSubject": "google:streamer-a@example.test", "reason": "self-grant attempt" }
      """
    Then the response status is 403

  Scenario: a mod cannot call the admin grant endpoint (moderate, not manage)
    Given "mod-a" signs in with a real Casdoor session
    When "mod-a" navigates to "/owncast/moderation"
    And "mod-a" POSTs to "/bff/owncast/admin/access/grant" with body:
      """
      { "userSubject": "google:streamer-a@example.test", "reason": "mod overreach attempt" }
      """
    Then the response status is 403

  Scenario: a streamer cannot read the moderation stream list
    Given "streamer-a" signs in with a real Casdoor session
    When "streamer-a" navigates to "/owncast/stream"
    And "streamer-a" GETs "/bff/owncast/mod/streams"
    Then the response status is 403

  Scenario: a plain admin cannot read the superadmin list-active endpoint
    Given "admin-domain-a" signs in with a real Casdoor session
    When "admin-domain-a" navigates to "/owncast/grants"
    And "admin-domain-a" GETs "/bff/owncast/superadmin/access"
    Then the response status is 403

  Scenario: an authenticated user without the owncast role cannot read the streamer surface
    Given "plain-user" signs in with a real Casdoor session
    When "plain-user" navigates to "/owncast/forbidden"
    And "plain-user" GETs "/bff/owncast/user/stream"
    Then the response status is 403

  Scenario: a superadmin may read the list-active endpoint (ALLOW — the isolation counterexample)
    Given "superadmin" signs in with a real Casdoor session
    When "superadmin" navigates to "/owncast/grants"
    And "superadmin" GETs "/bff/owncast/superadmin/access"
    Then the response status is 200
