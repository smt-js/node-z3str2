#!/usr/bin/env node

"use strict";

var solver = require("./solver");

// helpers
function runSync(problem) {
    console.log(solver.solveSync(problem));
}

function run(problem) {
    solver.solve(problem).done(function (solution) {
        console.log(solution);
    }, function (error) {
        console.error(error.stack);
    });
}

// main
function main() {

    var problem = "";

    // read the problem from stdin
    process.stdin.on("readable", function () {

        var datum = process.stdin.read();

        if (datum) {
            problem += datum;
        }
    });

    // upon the end of the input stream, find and print the solution
    process.stdin.on("end", function () {

        // run both sync and async
        console.log("\nrunning sync...");
        runSync(problem);

        console.log("\nrunning async...");
        run(problem);
    });
}

if (require.main === module) {
    main();
}
