const express = require("express");
const app = express();
app.use(express.json());

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const path = require("path");
const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;
const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
};
initializeDBAndServer();

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "TOP", (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        request.userId = payload.userId;
        next();
      }
    });
  }
};

const getFollowingIdsOfUser = async (userId) => {
  const getFollowingIdsQuery = `
    SELECT following_user_id
    FROM follower INNER JOIN user ON
    user.user_id = follower.follower_user_id
    WHERE user.user_id = ${userId};
    `;
  const followingIds = await db.all(getFollowingIdsQuery);
  const arrayOfIds = followingIds.map((eachUser) => eachUser.following_user_id);
  return arrayOfIds;
};

const tweetAccessVerification = async (request, response, next) => {
  const { userId } = request;
  const { tweetId } = request.params;
  const getTweetQuery = `
      SELECT *
      FROM
        tweet INNER JOIN follower ON tweet.user_id = follower.following_user_id
      WHERE follower_user_id = ${userId} AND tweet.tweet_id = ${tweetId};
      `;
  const tweet = await db.get(getTweetQuery);
  if (tweet === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    request.tweetId = tweetId;
    next();
  }
};

//API 1
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const selectUserQuery = `
    SELECT * 
    FROM user
    WHERE username = '${username}';
    `;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const createUserQuery = `
        INSERT INTO 
            user (username, password, name, gender)
        VALUES 
            ('${username}', '${hashedPassword}', '${name}', '${gender}');
        `;
      await db.run(createUserQuery);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//API 2
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  selectUserQuery = `
    SELECT * 
    FROM user 
    WHERE username = '${username}';
    `;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched) {
      const payload = { username: username, userId: dbUser.user_id };
      const jwtToken = jwt.sign(payload, "TOP");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//API 3
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { username, userId } = request;
  const followingIds = await getFollowingIdsOfUser(userId);
  console.log(followingIds, "a");
  const getTweetsQuery = `
    SELECT username, tweet, date_time AS dateTime
    FROM user INNER JOIN tweet ON user.user_id = tweet.user_id
    WHERE user.user_id IN (${followingIds});
    ORDER BY date_time DESC
    LIMIT 4;
    `;
  const tweets = await db.all(getTweetsQuery);
  response.send(tweets);
});

//API 4
app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username, userId } = request;
  const getFollowingListQuery = `
    SELECT user.name
    FROM user INNER JOIN follower ON user.user_id = follower.following_user_id
    WHERE follower.follower_user_id = ${userId};
    `;
  const followingList = await db.all(getFollowingListQuery);
  response.send(followingList);
});

//API 5
app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username, userId } = request;
  const getFollowersQuery = `
  SELECT name
  FROM user INNER JOIN follower ON user.user_id = follower.follower_user_id
  WHERE follower.following_user_id = ${userId};
    `;
  const followersList = await db.all(getFollowersQuery);
  response.send(followersList);
});

//API 6
app.get(
  "/tweets/:tweetId/",
  authenticateToken,
  tweetAccessVerification,
  async (request, response) => {
    const { tweetId } = request;
    const getTweetQuery = `
    SELECT 
      tweet,
      (SELECT COUNT(like_id) FROM like WHERE tweet_id = ${tweetId}) AS likes,
      (SELECT COUNT(reply_id) FROM reply WHERE tweet_id = ${tweetId}) AS replies,
      date_time AS dateTime 
    FROM tweet
    WHERE tweet_id = ${tweetId};
    `;
    const tweet = await db.get(getTweetQuery);
    response.send(tweet);
  }
);

//API 7
app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  tweetAccessVerification,
  async (request, response) => {
    const { tweetId } = request;
    const getLikesQuery = `
    SELECT username
    FROM user NATURAL JOIN tweet
    WHERE tweet_id = ${tweetId};
    `;
    const likes = await db.all(getLikesQuery);
    const likesArray = likes.map((eachUser) => eachUser.username);
    response.send({ likes: likesArray });
  }
);

//API 8
app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  tweetAccessVerification,
  async (request, response) => {
    const { tweetId } = request;
    const getRepliesQuery = `
    SELECT name, reply
    FROM user NATURAL JOIN reply 
    WHERE tweet_id = ${tweetId};
    `;
    const replies = await db.all(getRepliesQuery);
    response.send({ replies: replies });
  }
);

//API 9
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { userId } = request;
  const getTweetsOfUserQuery = `
    SELECT 
      tweet,
      COUNT(DISTINCT like_id) AS likes,
      COUNT(DISTINCT reply_id) AS replies,
      date_time AS dateTime
    FROM tweet LEFT JOIN reply ON tweet.tweet_id = reply.tweet_id 
      LEFT JOIN like ON tweet.tweet_id = like.tweet_id
    WHERE tweet.user_id = ${userId}
    GROUP BY tweet.tweet_id;
    `;
  const tweetsOfUser = await db.all(getTweetsOfUserQuery);
  response.send(tweetsOfUser);
});

//API 10
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { userId } = request;
  const { tweet } = request.body;
  const dateTime = new Date().toJSON().substring(0, 19).replace("T", " ");
  //   console.log(dateTime);
  const createTweetQuery = `
    INSERT INTO 
      tweet (tweet, user_id, date_time)
    VALUES 
      ('${tweet}', ${userId}, '${dateTime}');
    `;
  await db.run(createTweetQuery);
  response.send("Created a Tweet");
});

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { userId } = request;
    const { tweetId } = request.params;
    const getTheTweetQuery = `
    SELECT * 
    FROM tweet 
    WHERE user_id = ${userId} AND tweet_id = ${tweetId};
    `;
    const tweet = await db.get(getTheTweetQuery);
    if (tweet === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const deleteTweetQuery = `
        DELETE FROM tweet
        WHERE tweet_id = ${tweetId};
        `;
      await db.run(deleteTweetQuery);
      response.send("Tweet Removed");
    }
  }
);

module.exports = app;
