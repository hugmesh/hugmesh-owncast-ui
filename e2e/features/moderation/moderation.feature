# MULTIUSER-SITUATIONAL coverage — the moderation view (the mod moderates).
# MODERATE = MOD | ADMIN | SUPERADMIN admits the view; a streamer or plain user
# is forbidden. The mod reviews streams in their brand and acts (Hide forces
# internal; Kill bans broadcast; Restore lifts a ban) — moderation is
# domain-scoped to the mod's brand.
#
# @cluster — ships dark; config filters `not @cluster`.
@cluster @owncast-ui @multiuser-situational
Feature: Moderation view — a mod moderates streams in their brand
  As a mod, admin or superadmin
  I want to review streams and hide or kill ones that violate the rules
  So that broadcast stays within the brand's rules

  Scenario: a mod reaches the moderation view (ALLOW)
    Given "mod-a" has a seeded session
    When "mod-a" navigates to "/owncast/moderation"
    Then "mod-a" sees the "owncast-moderation-feed" view

  Scenario: an admin inherits the moderation view (ALLOW)
    Given "admin-domain-a" has a seeded session
    When "admin-domain-a" navigates to "/owncast/moderation"
    Then "admin-domain-a" sees the "owncast-moderation-feed" view

  Scenario: a mod hides a public stream in their brand and the streamer's console goes private
    # HONEST multiuser flow — real Casdoor sessions (the Hide POST is a real
    # write; a seeded localStorage session carries no bff cookie) and
    # victim-creates-first: the streamer creates their own stream and goes
    # public (via a real admin grant) BEFORE the mod acts, and the mod's Hide is
    # proven from BOTH sides — the moderation row flips to internal AND the
    # victim's own console shows the forced visibility.
    Given "admin-domain-a" signs in with a real Casdoor session
    And "admin-domain-a" has cleared broadcast overrides for "google:streamer-a@example.test"
    Given "streamer-a" signs in with a real Casdoor session
    When "streamer-a" navigates to "/owncast/stream"
    And "streamer-a" sets their stream details to title "Hide target" and description "About to be moderated" and saves
    And "streamer-a" resets their own stream visibility to internal
    And "streamer-a" reloads their stream console
    When "admin-domain-a" navigates to "/owncast/grants"
    And "admin-domain-a" grants broadcast to "google:streamer-a@example.test"
    Then "admin-domain-a" sees the applied result for "google:streamer-a@example.test" with type "broadcast"
    When "streamer-a" tries going public
    Then "streamer-a" sees the flip notice "Your stream is now public."
    Given "mod-a" signs in with a real Casdoor session
    When "mod-a" navigates to "/owncast/moderation"
    Then "mod-a" sees the "owncast-moderation-feed" view
    And "mod-a" sees a moderation row for "google:streamer-a@example.test"
    And "mod-a" sees the moderation row visibility "public" for "google:streamer-a@example.test"
    When "mod-a" hides the stream of "google:streamer-a@example.test"
    Then "mod-a" sees the moderation notice "Stream of google:streamer-a@example.test is now private."
    And "mod-a" sees the moderation row visibility "internal" for "google:streamer-a@example.test"
    And "mod-a" sees the hide action disabled with helptext on the row for "google:streamer-a@example.test"
    # The streamer consequence — the victim's own console reflects the forced flip.
    When "streamer-a" reloads their stream console
    Then "streamer-a" sees current visibility "internal"

  Scenario: a streamer cannot reach the moderation view — forbidden (DENY)
    Given "streamer-a" has a seeded session
    When "streamer-a" navigates to "/owncast/moderation"
    Then "streamer-a" is sent to the owncast forbidden screen

  Scenario: a plain user cannot reach the moderation view — forbidden (DENY)
    Given "plain-user" has a seeded session
    When "plain-user" navigates to "/owncast/moderation"
    Then "plain-user" is sent to the owncast forbidden screen
