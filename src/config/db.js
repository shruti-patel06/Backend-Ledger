const mongoose = require("mongoose");

function connectDB(){
    return mongoose.connect(process.env.MONGO_URI)
    .then(()=>{
        console.log("Server is connected to DB")
    })
    .catch(err=>{
        console.error("Error connecting to DB:", err.message)
        process.exit(1) // server ko bandh kardo varna resources use hojayenge
    })
}
module.exports=connectDB;