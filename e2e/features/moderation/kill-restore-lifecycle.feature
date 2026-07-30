# KILL + RESTORE LIFECYCLE — the destructive half of moderation, previously
# untested (only Hide had a flow, and window.confirm made Kill untestable until
# the dialog-aware steps existed). Kill = ban the streamer from broadcasting +
# force the stream internal, gated behind a native confirm dialog whose EXACT
# message is asserted; Restore lifts the ban. Both are proven from BOTH sides:
# the mod's row state (Banned badge, disabled+helptext Kill, Restore control)
# AND the victim's own console (forced internal; the next public attempt is
# denied by the live guard even though the broadcast GRANT is still active —
# ban beats grant; after Restore the same grant lets the flip succeed again
# with no re-grant).
#
# HONESTY: real Casdoor sessions in isolated contexts (kill/restore are real
# writes); victim-creates-first (the streamer creates + saves their own stream
# and goes public via a real admin grant BEFORE the mod acts); the dismissed
# confirm is proven to fire NO action by asserting the still-Active row FIRST
# (settled view) and only then the notice absence; exact texts throughout.
#
# @cluster — drives a LIVE host shell + owncast-bff + Casdoor; config filters
# `not @cluster`. bddgen still compiles + lists these.
@cluster @owncast-ui @multiuser
Feature: Moderation Kill and Restore — confirm-gated ban with the streamer consequence
  As a moderator
  I want Kill to ban a streamer from broadcasting until Restore lifts it
  So that rule-breaking broadcasts stop immediately and reversibly

  Scenario: a mod kills a public stream (accepting the confirm) and later restores it
    Given "admin-domain-a" signs in with a real Casdoor session
    And "admin-domain-a" has cleared broadcast overrides for "google:streamer-a@example.test"
    # Victim-creates-first: the streamer owns their stream and is genuinely public.
    Given "streamer-a" signs in with a real Casdoor session
    When "streamer-a" navigates to "/owncast/stream"
    And "streamer-a" sets their stream details to title "Kill target" and description "About to be killed" and saves
    And "streamer-a" resets their own stream visibility to internal
    And "streamer-a" reloads their stream console
    When "admin-domain-a" navigates to "/owncast/grants"
    And "admin-domain-a" grants broadcast to "google:streamer-a@example.test"
    Then "admin-domain-a" sees the applied result for "google:streamer-a@example.test" with type "broadcast"
    When "streamer-a" tries going public
    Then "streamer-a" sees the flip notice "Your stream is now public."
    # The mod kills — the confirm dialog's exact message is asserted, then accepted.
    Given "mod-a" signs in with a real Casdoor session
    When "mod-a" navigates to "/owncast/moderation"
    Then "mod-a" sees a moderation row for "google:streamer-a@example.test"
    And "mod-a" sees the active badge on the row for "google:streamer-a@example.test"
    When "mod-a" kills the stream of "google:streamer-a@example.test" accepting the confirm dialog
    Then "mod-a" sees the moderation notice "Stream of google:streamer-a@example.test was killed — the streamer is banned from broadcasting."
    And "mod-a" sees the banned badge on the row for "google:streamer-a@example.test"
    And "mod-a" sees the moderation row visibility "internal" for "google:streamer-a@example.test"
    And "mod-a" sees the kill action disabled with helptext on the row for "google:streamer-a@example.test"
    And "mod-a" sees the restore action on the row for "google:streamer-a@example.test"
    # Streamer consequence: forced internal, and the ban DENIES the next public
    # attempt even though the broadcast grant is still active (ban beats grant).
    When "streamer-a" reloads their stream console
    Then "streamer-a" sees current visibility "internal"
    When "streamer-a" tries going public
    Then "streamer-a" sees the broadcast-denied flip error
    # Restore lifts the ban; the ORIGINAL grant (never revoked) admits the
    # streamer again with no re-grant — proving restore only removes the ban.
    When "mod-a" restores the stream of "google:streamer-a@example.test"
    Then "mod-a" sees the moderation notice "Ban lifted for google:streamer-a@example.test — they may be re-granted broadcast."
    And "mod-a" sees the active badge on the row for "google:streamer-a@example.test"
    When "streamer-a" tries going public
    Then "streamer-a" sees the flip notice "Your stream is now public."

  Scenario: dismissing the kill confirm fires no action
    Given "admin-domain-a" signs in with a real Casdoor session
    And "admin-domain-a" has cleared broadcast overrides for "google:streamer-a@example.test"
    Given "streamer-a" signs in with a real Casdoor session
    When "streamer-a" navigates to "/owncast/stream"
    And "streamer-a" sets their stream details to title "Not killed" and description "Confirm dismissed" and saves
    Given "mod-a" signs in with a real Casdoor session
    When "mod-a" navigates to "/owncast/moderation"
    Then "mod-a" sees a moderation row for "google:streamer-a@example.test"
    When "mod-a" starts killing the stream of "google:streamer-a@example.test" but dismisses the confirm dialog
    # Positive row assertion FIRST (the view is settled), then the absence check:
    # the dismissed confirm banned nobody and surfaced no action notice.
    Then "mod-a" sees the active badge on the row for "google:streamer-a@example.test"
    And "mod-a" sees no moderation notice
