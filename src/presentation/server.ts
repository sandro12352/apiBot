import express, { Router } from "express";

export interface Options {
    port: number;
    routes: Router;
}

export class Server {
    private readonly app = express();
    private readonly port: number;
    private readonly routes: Router;


    constructor(options: Options) {
        const { port, routes } = options;
        this.port = port;
        this.routes = routes;
    }


    async start() {

        // Middleware
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true })); // opcional, para x-www-form-urlencoded
        
        //Public Folder

        // Routes
        this.app.use(this.routes);



        this.app.listen(this.port, () => {
            console.log(`Server is running on port ${this.port}`);
        });

    }

}