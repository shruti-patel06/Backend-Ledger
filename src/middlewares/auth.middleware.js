const userModel = require("../models/user.model");
const jwt = require("jsonwebtoken");
const tokenBlacklistModel = require("../models/blacklist.model");

// An explicit Authorization header wins over the cookie: the cookie is ambient (it is sent
// automatically), so letting it win would make API clients act as whoever logged in last
function getTokenFromRequest(req) {
  return req.headers.authorization?.split(" ")[1] || req.cookies.token; // token should be in either of them
}

async function authMiddleware(req, res, next) {
  const token = getTokenFromRequest(req);
  if (!token) {
    return res.status(401).json({
      message: "Unauthorized access, token is missing",
    });
  }

  //Checking if the token is already blacklisted
  const isBlacklisted = await tokenBlacklistModel.findOne({ token });
  if (isBlacklisted) {
    return res.status(401).json({
      message: "Unauthorized access, token is blacklisted",
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET); //token contains user id here

    const user = await userModel.findById(decoded.userId);
    // Token is valid but the user it was issued to no longer exists
    if (!user) {
      return res.status(401).json({
        message: "Unauthorized access, user not found",
      });
    }

    req.user = user;

    return next();
  } catch (err) {
    return res.status(401).json({
      message: "Unauthorized access, token is invalid",
    });
  }
}
async function authSystemUserMiddleware(req, res, next) {
  const token = getTokenFromRequest(req);
  if (!token) {
    return res.status(401).json({
      message: "Unauthorized access, token is missing",
    });
  }
  //Checking if the token is already blacklisted
  const isBlacklisted = await tokenBlacklistModel.findOne({ token });
  if (isBlacklisted) {
    return res.status(401).json({
      message: "Unauthorized access, token is blacklisted",
    });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await userModel.findById(decoded.userId).select("+system");
    if (!user) {
      return res.status(401).json({
        message: "Unauthorized access, user not found",
      });
    }
    if (!user.system) {
      return res.status(403).json({
        message: "Forbidden access,not a system user",
      });
    }

    req.user = user;
    return next();
  } catch (err) {
    return res.status(401).json({
      message: "Unauthorized access, token is invalid",
    });
  }
}
module.exports = {
  authMiddleware,
  authSystemUserMiddleware,
  getTokenFromRequest,
};
