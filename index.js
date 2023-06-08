const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("too much hot so stay home and learn something new. Enjoy!!");
});

app.listen(port, () => {
  console.log(`MelodyMakers server is running on port ${port}`);
});
