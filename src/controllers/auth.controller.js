const userModel = require("../models/user.model");
const jwt = require("jsonwebtoken");
const emailService = require("../services/email.service")
/**
 * - user register controller
 *  -POST /api/auth/register
 */
async function userRegisterController(req,res){
    const { email,password,name } = req.body;
    const isExists = await userModel.findOne({
        email:email
    })
    if(isExists){
        return res.status(422).json({
            message : "User already exists with email",
            status: "failed"
        })
    }
    const user = await userModel.create({
        email,
        name,
        password
    })
    // console.log("JWT_SECRET:", process.env.JWT_SECRET);
    const token = jwt.sign({userId:user._id},process.env.JWT_SECRET,{expiresIn : "3d"})
    res.cookie("token",token);
    res.status(201).json({
        message:"User created successfully",
        user:{
            _id:user._id,
            email:user.email,
            name:user.name
        },
        token

    })
    // Send Email after response to reduce user waiting time
    await emailService.sendRegistrationEmail(user.email,user.name)

}
/**
 * -User Login controller
 * -POST /api/auth/login
 *  
 */
async function userLogincontroller(req,res){
    const { email,password }=req.body;

    const user = await userModel.findOne({ email }).select("+password");
    if(!user){
        return res.status(401).json({
            message:"Email or password is INVALID"
        })
    }
    //If user found
    
    const isValidPw = await user.comparePassword(password);
    if(!isValidPw){
        return res.status(401).json({
            message:"Email or password INVALID"
        })
    }
    const token = jwt.sign({userId:user._id},process.env.JWT_SECRET,{expiresIn : "3d"})
    res.cookie("token",token);
    res.status(200).json({
        message:"User logged in successfully",
        user:{
            _id:user._id,
            email:user.email,
            name:user.name
        },
        token
    })
}
module.exports={ 
    userRegisterController,
    userLogincontroller
}