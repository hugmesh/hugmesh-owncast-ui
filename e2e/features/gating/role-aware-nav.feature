# USER-SITUATIONAL coverage — the role-aware console nav (owncast-console.
# component.ts visibleItems()). The console SHOWS only the nav items a role can
# use (defence-in-depth; the child guards + bff are authoritative): a plain
# STREAMER sees only "My Stream"; a MOD additionally sees Moderation; an ADMIN
# additionally sees Broadcast grants; a SUPERADMIN sees everything; a user with
# NONE of the owncast roles sees an EMPTY menubar (the feature greyed-out / no-
# access surface for the optional streaming service).
#
# This is the UI half of the feature-gating story: when a role can't use a part
# of the optional owncast service, the console never offers it — and a user with
# no owncast access reaches the mount but sees nothing actionable and is bounced
# to the in-remote forbidden screen by the default route guard.
#
# @cluster — ships dark; config filters `not @cluster`.
@cluster @owncast-ui @user-situational
Feature: Role-aware owncast console nav — each role sees only what it can use
  As the owncast console shell
  I want the nav to show only the views a role may use
  So that the optional streaming service degrades gracefully per role

  Scenario: a streamer sees only the My Stream nav link
    Given "streamer-a" has a seeded session
    When "streamer-a" navigates to "/owncast/stream"
    Then "streamer-a" sees the "stream" nav link
    And "streamer-a" does not see the "grants" nav link
    And "streamer-a" does not see the "moderation" nav link

  Scenario: a mod sees Moderation but not Broadcast grants
    Given "mod-a" has a seeded session
    When "mod-a" navigates to "/owncast/moderation"
    Then "mod-a" sees the "moderation" nav link
    And "mod-a" does not see the "grants" nav link

  Scenario: an admin sees My Stream, Broadcast grants and Moderation
    Given "admin-domain-a" has a seeded session
    When "admin-domain-a" navigates to "/owncast/grants"
    Then "admin-domain-a" sees the "stream" nav link
    And "admin-domain-a" sees the "grants" nav link
    And "admin-domain-a" sees the "moderation" nav link

  Scenario: a superadmin sees every owncast nav link
    Given "superadmin" has a seeded session
    When "superadmin" navigates to "/owncast/grants"
    Then "superadmin" sees the "stream" nav link
    And "superadmin" sees the "grants" nav link
    And "superadmin" sees the "moderation" nav link

  Scenario: a user with no owncast role sees an empty console nav (greyed-out / no access)
    Given "plain-user" has a seeded session
    When "plain-user" navigates to "/owncast/forbidden"
    Then "plain-user" sees an empty owncast console nav
