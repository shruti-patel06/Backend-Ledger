const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const userSchema =new mongoose.Schema({
    email:{
        type:String,
        required:[true,"Email is required for creating a user"],
        trim:true,
        lowercase:true,
        match:[/^[\w.-]+@[a-zA-Z\d.-]+\.[a-zA-Z]{2,}$/,
            "Invalid Email Address"
        ],
        unique : [true,"Email Already Exists"]
    },
    name:{
        type:String,
        required:[true,"Name is required for creating an account"],
    },
    password:{
        type:String,
        required:[true,"Password is required for creating an account"],
        minlength:[6,"password should contain more than 6 characters"],
        select:false //pw un queries mein nahi aayega jab tak hum usse bol nahi rahe ki tum aao--simply by default pw nahi aayega.
    }
},{
    timestamps:true //user creation and user data updation time 
})

userSchema.pre("save",async function(){ // Agar user ka pw change hua hai toh use bhi hash karo
    if(!this.isModified("password")){ // if not modified
        return //next is not func and cannot be used with  async await
    }
    //Agar pw change hua hai toh hash karo
    const hash = await bcrypt.hash(this.password,10);
    this.password = hash
    return 
})

userSchema.methods.comparePassword = async function(password){
    // console.log(password,this.passsword);
    return await bcrypt.compare(password,this.password) // return T/F whether pws match
}
const userModel = mongoose.model("user",userSchema);
module.exports = userModel;
