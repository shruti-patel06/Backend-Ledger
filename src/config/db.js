const mongoose = require("mongoose");

function connectDB(){
    mongoose.connect(process.env.MONGO_URI)
    .then(()=>{
        console.log("Server is connected to DB")
    })
    .catch(err=>{
        console.log("Error connecting to DB")
        process.exit(1) // server ko bandh kardo varna resources use hojayenge
    })
}
module.exports=connectDB;