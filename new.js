const express = require('express')
const app = express()
app.use(express.json())

const sqlite3 = require('sqlite3')
const {open} = require('sqlite')

const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

const path = require('path')
const dbPath = path.join(__dirname, 'twitterClone.db')
let db
const intializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log(`TwitterClone Server Started`)
    })
  } catch (e) {
    console.log(`DB Error: ${e.message}`)
  }
}
intializeDBAndServer()

// middliewares
function authenticate(req, res, next) {
  const authHeader = req.headers['authorization']
  let jwtToken
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken === undefined) {
    res.status(401).send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'NxtWave_Sheshi', (e, payload) => {
      if (e) {
        res.status(401).send('Invalid JWT Token')
      } else {
        req.username = payload.username
      }
    })
  }

  console.log(jwtToken)
  console.log(res._headerSent)
  if (!res._headerSent) {
    next()
  }
}

// 2. Return jwt by Login
app.post('/login/', async (req, res) => {
  const {username, password} = req.body
  console.log(username)
  const defaultUser = await db.get(
    `select * from user where username = '${username}';`,
  )
  if (defaultUser === undefined) {
    res.status(400).send('Invalid user')
  } else {
    const isPasswordMatched = await bcrypt.compare(
      password,
      defaultUser.password,
    )
    if (isPasswordMatched) {
      const jwtToken = jwt.sign({username}, 'NxtWave_Sheshi')
      res.send({jwtToken})
    } else {
      res.status(400).send('Invalid passsword')
    }
  }
})

// 3. Return latest tweets of following people of logged in user
app.get('/user/tweets/feed/', authenticate, async (req, res) => {
  const username = req.username
  const query = `
  from user
  `
  res.send(username)
})

module.exports = app
