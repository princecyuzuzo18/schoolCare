# Parent / Student Sign-Up Testing

All sign-up integration tests use a **dedicated** MariaDB database. They never
read from or write to the live `schoolcare_db`.

## 1. Provision the test database (one time, administrator required)

`schoolcare_user` cannot create databases with its current grants. Run this as a
MariaDB administrator:

```bash
sudo mariadb < mysql/create_signup_test_db.sql
```

If your system uses `mysql` instead of `mariadb`:

```bash
sudo mysql < mysql/create_signup_test_db.sql
```

This creates `schoolcare_signup_test` and grants the existing
`schoolcare_user@localhost` the same privileges it already has on
`schoolcare_db`. It does **not** reset the password or touch live data.

## 2. Initialize the test schema

The initializer refuses to run if the test database already has tables, so it
can never overwrite an existing test run.

```bash
npm run test:signup:init
```

The npm script already sets `DB_DATABASE` and `DB_NAME` to the isolated test
database; you do not need to repeat them on the command line.

This imports the existing base schema into the test database only, rewrites the
hard-coded `USE schoolcare_db` statement to the test database, then applies the
migrations including `004_parent_student_signup`.

## 3. Run the tests

```bash
npm run test:signup
DB_DATABASE=schoolcare_signup_test DB_NAME=schoolcare_signup_test npm run test:db
DB_DATABASE=schoolcare_signup_test DB_NAME=schoolcare_signup_test npm run db:check
```

`test:signup` and `test:signup:init` set the database environment variables
themselves. The generic database checks do not, so keep the explicit prefix for
those. The sign-up scripts still refuse to run against `schoolcare_db`.

The sign-up suite uses a temporary JSON data directory and a local fake SMS
webhook, so no real email or SMS is sent. It covers:

- parent and student registration with generated or supplied sign-in emails;
- invalid admission numbers and duplicate requests;
- parent links to several children and rejection of unrelated child links;
- approval gating before login succeeds;
- linked-child and own-record scoping on dashboards and detail endpoints;
- parent/student denial of staff-only registration;
- unchanged headteacher approval permission.

To reset the test database after a failed run, ask an administrator to drop and
recreate `schoolcare_signup_test`, then repeat step 2. Never drop
`schoolcare_db`.
