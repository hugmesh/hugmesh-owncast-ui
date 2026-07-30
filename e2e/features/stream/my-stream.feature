# USER-SITUATIONAL coverage — the streamer's OWN "My Stream" console: the ALLOW
# surface (a ROLE_OWNCAST user controls their own stream) plus the canonical
# disabled+helptext gate (the public-visibility option is disabled until an admin
# grants broadcast, and the disabled radio ALWAYS pairs with visible helptext
# explaining why — owncast-stream.component.html publicDisabled() +
# owncast-stream-public-disabled-help).
#
# A user controls their OWN stream visibility; the PUBLIC flip is server-gated on
# an active broadcast grant (owncastStreamGuard admits the view; the bff
# OwncastBroadcastGuard is authoritative on the flip).
#
# @cluster — ships dark; the default config filters `not @cluster` so no live
# stack is needed. bddgen still compiles + lists these so the Gherkin is proven
# to parse offline.
@cluster @owncast-ui @user-situational
Feature: My Stream console — a streamer controls their own stream
  As a domain user with the owncast streamer role
  I want to control my own stream's title, description and visibility
  So that I decide what I broadcast, within the broadcast grant my admin allows

  Scenario: a streamer reaches their own stream console (ALLOW)
    # REAL session: the details form only renders after the own-stream load
    # succeeds (a cookie-less seeded session would 401 into the load-error
    # branch and the form would never appear against a live stack).
    Given "streamer-a" signs in with a real Casdoor session
    When "streamer-a" navigates to "/owncast/stream"
    Then "streamer-a" sees the "owncast-stream-title" view
    And "streamer-a" can edit their stream title

  Scenario: a streamer without a broadcast grant cannot go public — disabled + helptext
    # REAL session + victim-creates-first: the visibility section only renders
    # once the streamer HAS a stream, and starting from a real internal stream
    # makes the fail-closed disabled+helptext state the live UI truth (the UI
    # stays fail-closed until a public flip is proven, whatever the server's
    # grant state).
    Given "streamer-a" signs in with a real Casdoor session
    When "streamer-a" navigates to "/owncast/stream"
    And "streamer-a" sets their stream details to title "Gate check" and description "Fail-closed state" and saves
    And "streamer-a" resets their own stream visibility to internal
    And "streamer-a" reloads their stream console
    Then "streamer-a" sees the "owncast-stream-title" view
    And "streamer-a" sees the public-visibility option disabled
    And "streamer-a" sees the broadcast-gate helptext

  Scenario: a user with no owncast role is sent to the in-remote forbidden screen (DENY)
    Given "plain-user" has a seeded session
    When "plain-user" navigates to "/owncast/stream"
    Then "plain-user" is sent to the owncast forbidden screen

  Scenario: the default owncast route guards the same as /owncast/stream (DENY redirect)
    Given "plain-user" has a seeded session
    When "plain-user" navigates to "/owncast"
    Then "plain-user" is sent to the owncast forbidden screen
