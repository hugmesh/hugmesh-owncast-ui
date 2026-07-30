# MULTIUSER-SITUATIONAL + USER-SITUATIONAL coverage — the Broadcast Grants
# console (admin/mod gate whether a stream may broadcast). MANAGE = ADMIN |
# SUPERADMIN admits the console; the list-active + history READ panels are
# SUPERADMIN-only (canManageAll → the bff /superadmin/** reads), so a plain admin
# sees the action form but NOT the panels — the within-console privilege step.
#
# An admin/superadmin governs whether a user's stream may go public: broadcast is
# default-deny and a grant is the only thing that confers it.
#
# @cluster — ships dark; config filters `not @cluster`.
@cluster @owncast-ui @multiuser-situational
Feature: Broadcast grants console — admin gates who may broadcast
  As a domain admin or superadmin
  I want to grant, time out, ban and restore a user's broadcast access
  So that I gate whether each streamer's stream may go public

  Scenario: an admin reaches the grants console and sees the action form (ALLOW)
    Given "admin-domain-a" has a seeded session
    When "admin-domain-a" navigates to "/owncast/grants"
    Then "admin-domain-a" sees the "owncast-grants-title" view
    And "admin-domain-a" sees the grant-action form

  Scenario: a plain admin does NOT see the superadmin-only active-grants + history panels
    Given "admin-domain-a" has a seeded session
    When "admin-domain-a" navigates to "/owncast/grants"
    Then "admin-domain-a" sees the grant-action form
    And "admin-domain-a" does not see the active-grants panel

  Scenario: a superadmin additionally sees the active-grants read panel (MANAGE-ALL)
    Given "superadmin" has a seeded session
    When "superadmin" navigates to "/owncast/grants"
    Then "superadmin" sees the "owncast-grants-title" view
    And "superadmin" sees the grant-action form
    And "superadmin" sees the active-grants panel

  Scenario: a mod cannot reach the grants console — forbidden (DENY)
    Given "mod-a" has a seeded session
    When "mod-a" navigates to "/owncast/grants"
    Then "mod-a" is sent to the owncast forbidden screen

  Scenario: a streamer cannot reach the grants console — forbidden (DENY)
    Given "streamer-a" has a seeded session
    When "streamer-a" navigates to "/owncast/grants"
    Then "streamer-a" is sent to the owncast forbidden screen
