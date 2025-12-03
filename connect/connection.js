const Mongoose=require("mongoose")

const connectDb=async()=>{
    try{
        const connection=await Mongoose.connect(process.env.MONGO_URL)
        if(!connection){
            return console.log("Error while Connecting DB");
        }
        console.log(`DB Connected `);

    }catch(err){
        console.log(err);
    }
}


module.exports=connectDb