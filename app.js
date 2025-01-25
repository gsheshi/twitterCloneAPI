const express = require('express')
const sqlite3 = require('sqlite3')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcrypt')
const {open} = require('sqlite')

const app = express()
app.use(express.json())

const dbPath = __dirname + '/twitterClone.db'
let db = null

const initializeDbAndServer = async () => {
  try {
    db = await open({filename: dbPath, driver: sqlite3.Database})
    app.listen(3000, () => {
      console.log('Server running at http://localhost:3000/')
    })
  } catch (error) {
    console.error(`Error initializing database: ${error.message}`)
    process.exit(1)
  }
}

initializeDbAndServer()

// Middleware to authenticate JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization']
  if (!authHeader) {
    return res.status(401).send('Invalid JWT Token')
  }
  const token = authHeader.split(' ')[1]
  jwt.verify(token, 'SECRET_KEY', (error, payload) => {
    if (error) {
      return res.status(401).send('Invalid JWT Token')
    }
    req.user = payload
    next()
  })
}

// API 1: Register a new user
app.post('/register/', async (req, res) => {
  const {username, password, name, gender} = req.body
  const existingUserQuery = `SELECT * FROM user WHERE username = ?`
  const user = await db.get(existingUserQuery, username)

  if (user) {
    return res.status(400).send('User already exists')
  }
  if (password.length < 6) {
    return res.status(400).send('Password is too short')
  }
  const hashedPassword = await bcrypt.hash(password, 10)
  const createUserQuery = `INSERT INTO user (name, username, password, gender) VALUES (?, ?, ?, ?)`
  await db.run(createUserQuery, [name, username, hashedPassword, gender])
  res.send('User created successfully')
})

// API 2: Login
app.post('/login/', async (req, res) => {
  const {username, password} = req.body
  const userQuery = `SELECT * FROM user WHERE username = ?`
  const user = await db.get(userQuery, username)

  if (!user) {
    return res.status(400).send('Invalid user')
  }
  const isPasswordCorrect = await bcrypt.compare(password, user.password)
  if (!isPasswordCorrect) {
    return res.status(400).send('Invalid password')
  }
  const payload = {userId: user.user_id}
  const token = jwt.sign(payload, 'SECRET_KEY')
  res.send({jwtToken: token})
})

// API 3: Latest tweets feed
app.get('/user/tweets/feed/', authenticateToken, async (req, res) => {
  const {userId} = req.user
  const query = `
    SELECT user.username, tweet.tweet, tweet.date_time AS dateTime
    FROM follower
    INNER JOIN tweet ON follower.following_user_id = tweet.user_id
    INNER JOIN user ON user.user_id = tweet.user_id
    WHERE follower.follower_user_id = ?
    ORDER BY tweet.date_time DESC
    LIMIT 4;
  `
  const tweets = await db.all(query, userId)
  res.send(tweets)
})

// API 4: Following list
app.get('/user/following/', authenticateToken, async (req, res) => {
  const {userId} = req.user
  const query = `
    SELECT user.name
    FROM follower
    INNER JOIN user ON user.user_id = follower.following_user_id
    WHERE follower.follower_user_id = ?;
  `
  const following = await db.all(query, userId)
  res.send(following)
})

// API 5: Followers list
app.get('/user/followers/', authenticateToken, async (req, res) => {
  const {userId} = req.user
  const query = `
    SELECT user.name
    FROM follower
    INNER JOIN user ON user.user_id = follower.follower_user_id
    WHERE follower.following_user_id = ?;
  `
  const followers = await db.all(query, userId)
  res.send(followers)
})

// API 6: Get tweet details
app.get('/tweets/:tweetId/', authenticateToken, async (req, res) => {
  const {userId} = req.user
  const {tweetId} = req.params

  const tweetQuery = `
    SELECT tweet.tweet, tweet.date_time AS dateTime, 
           (SELECT COUNT(*) FROM like WHERE tweet_id = ?) AS likes, 
           (SELECT COUNT(*) FROM reply WHERE tweet_id = ?) AS replies
    FROM tweet
    INNER JOIN follower ON tweet.user_id = follower.following_user_id
    WHERE tweet.tweet_id = ? AND follower.follower_user_id = ?;
  `

  const tweet = await db.get(tweetQuery, tweetId, tweetId, tweetId, userId)

  if (!tweet) {
    return res.status(401).send('Invalid Request')
  }
  res.send(tweet)
})

// API 7: Get users who liked a tweet
app.get('/tweets/:tweetId/likes/', authenticateToken, async (req, res) => {
  const {userId} = req.user
  const {tweetId} = req.params

  const tweetAccessQuery = `
    SELECT 1
    FROM tweet
    INNER JOIN follower ON tweet.user_id = follower.following_user_id
    WHERE tweet.tweet_id = ? AND follower.follower_user_id = ?;
  `

  const hasAccess = await db.get(tweetAccessQuery, tweetId, userId)

  if (!hasAccess) {
    return res.status(401).send('Invalid Request')
  }

  const likeQuery = `
    SELECT user.username
    FROM like
    INNER JOIN user ON like.user_id = user.user_id
    WHERE like.tweet_id = ?;
  `
  const likes = await db.all(likeQuery, tweetId)

  res.send({likes: likes.map(like => like.username)})
})

// API 8: Get replies to a tweet
app.get('/tweets/:tweetId/replies/', authenticateToken, async (req, res) => {
  const {userId} = req.user
  const {tweetId} = req.params

  const replyQuery = `
    SELECT user.name, reply.reply
    FROM reply
    INNER JOIN user ON reply.user_id = user.user_id
    WHERE reply.tweet_id = ? AND EXISTS (
      SELECT 1
      FROM follower
      WHERE follower.following_user_id = reply.user_id AND follower.follower_user_id = ?
    );
  `
  const replies = await db.all(replyQuery, tweetId, userId)

  if (replies.length === 0) {
    return res.status(401).send('Invalid Request')
  }
  res.send({replies})
})

// API 9: Get user's tweets
app.get('/user/tweets/', authenticateToken, async (req, res) => {
  const {userId} = req.user

  const userTweetsQuery = `
    SELECT tweet.tweet, 
           (SELECT COUNT(*) FROM like WHERE like.tweet_id = tweet.tweet_id) AS likes, 
           (SELECT COUNT(*) FROM reply WHERE reply.tweet_id = tweet.tweet_id) AS replies,
           tweet.date_time AS dateTime
    FROM tweet
    WHERE tweet.user_id = ?;
  `
  const tweets = await db.all(userTweetsQuery, userId)
  res.send(tweets)
})

// API 10: Create a tweet
app.post('/user/tweets/', authenticateToken, async (req, res) => {
  const {userId} = req.user
  const {tweet} = req.body

  const createTweetQuery = `INSERT INTO tweet (tweet, user_id, date_time) VALUES (?, ?, ?) `
  await db.run(createTweetQuery, [tweet, userId, new Date().toISOString()])
  res.send('Created a Tweet')
})

// API 11: Delete a tweet
app.delete('/tweets/:tweetId/', authenticateToken, async (req, res) => {
  const {userId} = req.user
  const {tweetId} = req.params

  const tweetQuery = `SELECT * FROM tweet WHERE tweet_id = ? AND user_id = ?`
  const tweet = await db.get(tweetQuery, tweetId, userId)

  if (!tweet) {
    return res.status(401).send('Invalid Request')
  }

  const deleteTweetQuery = `DELETE FROM tweet WHERE tweet_id = ?`
  await db.run(deleteTweetQuery, tweetId)
  res.send('Tweet Removed')
})

module.exports = app
