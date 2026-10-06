require("dotenv").config()
const app = require("./src/app");
const connectDB = require("./src/config/db")
const { ensureSystemUser } = require("./src/services/systemUser.service")

const PORT = process.env.PORT || 3000;

connectDB().then(()=>
    // Failure here shouldn't take the API down - only the initial-funds demo depends on it
    ensureSystemUser().catch(err=>console.error("Error setting up system user:", err.message))
);
app.listen(PORT,()=>{
    console.log(`Server is running on port ${PORT}`);
})