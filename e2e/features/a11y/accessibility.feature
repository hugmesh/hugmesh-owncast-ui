# A11Y coverage — the org accessibility standard on the owncast remote: skip-link
# → focusable main region, the role="menubar" console nav with an accessible name
# and roving tabindex + Arrow-key navigation, each view region named, and the
# within-service forbidden screen announced as an alert. Asserted against the
# real shell + console markup (app.component.html, owncast-console.component.html,
# owncast-forbidden.component.html).
#
# @cluster — ships dark (the remote must be served by the host); config filters
# `not @cluster`. bddgen still compiles + lists these so the Gherkin parses.
@cluster @owncast-ui @a11y
Feature: Owncast console accessibility — skip-link, menubar, roving tabindex, focus
  As a keyboard or screen-reader user
  I want the owncast console to meet the org a11y standard
  So that I can operate it without a mouse and hear every state

  Scenario: the skip link moves focus to the main region
    Given "admin-domain-a" has a seeded session
    When "admin-domain-a" navigates to "/owncast/grants"
    Then "admin-domain-a" can tab to the skip link
    And activating the skip link moves focus to the main region

  Scenario: the console nav is a named menubar with named items
    Given "superadmin" has a seeded session
    When "superadmin" navigates to "/owncast/grants"
    Then the owncast console nav has an accessible name
    And each owncast nav link has an accessible name

  Scenario: the console nav uses roving tabindex with arrow-key navigation
    Given "superadmin" has a seeded session
    When "superadmin" navigates to "/owncast/grants"
    Then only the active owncast nav link is in the tab order
    When "superadmin" focuses the first owncast nav link
    Then arrow-key navigation moves focus along the owncast nav links

  Scenario: each owncast view region is programmatically named
    # The moderation feed region renders on load (unlike the grants RESULT panel,
    # which only exists after an action was applied — asserting the result panel
    # here could never pass because the scenario applies no action).
    Given "admin-domain-a" has a seeded session
    When "admin-domain-a" navigates to "/owncast/moderation"
    Then the "owncast-moderation-feed" view has an accessible name

  Scenario: the in-remote forbidden screen is announced as an alert
    Given "plain-user" has a seeded session
    When "plain-user" navigates to "/owncast/stream"
    Then "plain-user" is sent to the owncast forbidden screen
    And the owncast forbidden screen announces the denial
