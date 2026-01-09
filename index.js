import express from "express"
import cors from "cors"
import route from "./routes.js";
import dotenv from "dotenv";
import compression from "compression";

const app = express();
dotenv.config({
    path:".env"
})

app.use(cors());
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use("/" , route)

app.listen(process.env.PORT , (req,res)=>{
 console.log(`Server started on port: ${process.env.PORT}`);
})


