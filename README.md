# FIA Formula penalties background worker API

Express server handling long-running background tasks to complement [FIA decisions](https://github.com/gizinski-jacek/fia-decisions) app.

## Table of contents

- [Github & Live](#github--live)
- [Getting Started](#getting-started)
- [Deploy](#deploy)
- [Features](#features)
- [Status](#status)
- [Contact](#contact)

# Github & Live

Github repo can be found [here](https://github.com/gizinski-jacek/fia-decisions-worker-api).

NextJS client can be found [here](https://github.com/gizinski-jacek/fia-decisions).

Live demo can be found on [Heroku](https://fia-decisions-worker-api-22469.herokuapp.com).

## Getting Started

Install all dependancies by running:

```bash
npm install
```

Queue worker needs Redis to function properly.\
Refer [to Redis documentation](https://redis.io/docs/getting-started/#install-redis) to install it locally.

In the project root directory run the app with:

```bash
npm start
```

## Deploy

You can easily deploy this app using [Heroku Platform](https://devcenter.heroku.com/articles/git).

In the project root directory run these commands:

```bash
curl https://cli-assets.heroku.com/install-ubuntu.sh | sh
heroku create
heroku addons:create heroku-redis
git push heroku main
heroku ps:scale worker=1
heroku open
```

Don't forget to add **.env** file with environment variables for the app.

## Features

- API endpoints for:
  - Creating worker jobs to update newest documents for specific series and year
  - Creating worker jobs to update all documents for specific series and year

## Status

Project status: **_MOSTLY FINISHED_**

## Contact

Feel free to contact me at:

```
gizinski.jacek.tr@gmail.com
```
