"use strict";

// node dependencies
var childProcess = require("child_process");
var assert       = require("assert");
var fs           = require("fs");

// external dependencies
var Q   = require("q");
var tmp = require("tmp");

// constants
var ASSIGNMENT_PATTERN = /^([^:]+) : (\w)+ -> (.+)$/;
var ERROR_PATTERN      = /^\(error/m;
var UNSAT_PATTERN      = /^>> UNSAT/m;

var INPUT_FILE_MODE      = parseInt("0644", 8);
var INPUT_FILE_PREFIX    = "node-z3str2-";
var INPUT_FILE_EXTENSION = ".smt2";

var Z3_INVOCATION = "Z3-str.py";

var TRACE = "TRACE" in process.env;

// NOTE:
//      the input file is a singleton; this means that
//      solve() is not thread-safe
function createInputFile() {
    var inputFileOptions = {
        mode:    INPUT_FILE_MODE,
        prefix:  INPUT_FILE_PREFIX,
        postfix: INPUT_FILE_EXTENSION
    };

    var tempFile = tmp.fileSync(inputFileOptions);

    return tempFile.name;
}
var INPUT_FILE_PATH = createInputFile();

// helpers
function commandToArgs(command) {
    var split = command.split(" ");

    return {
        command: split[0],
        args:    split.slice(1)
    };
}

function spawnPromise(commandString) {

    // spawn the task
    var command = commandToArgs(commandString);
    var task    = childProcess.spawn(command.command, command.args);

    var stdout = "";
    var stderr = "";

    // accumulate output
    task.stdout.on("data", function (datum) {
        stdout += datum;
    });
    task.stderr.on("data", function (datum) {
        stderr += datum;
    });

    // set up a promise to be fulfilled/rejected when the task finishes
    var deferred = Q.defer();

    task.on("close", function (code) {
        if (code !== 0) {
            deferred.reject(stderr);
        } else {
            deferred.resolve(stdout, stderr);
        }
    });
    task.on("error", function (error) {
        deferred.reject(error, stderr);
    });

    return deferred.promise;
}

function parseSolution(solutionString) {
    if (TRACE) {
        console.error(solutionString);
    }

    // check for errors
    if (ERROR_PATTERN.test(solutionString)) {
        throw Error(solutionString);
    }

    // if there is no solution, return null
    if (UNSAT_PATTERN.test(solutionString)) {
        return null;
    }

    // otherwise, parse the assignment
    var assignments = [];
    var lines       = solutionString.split("\n");

    // look at each line
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];

        // find lines that look like assignments
        var match = line.match(ASSIGNMENT_PATTERN);

        // interpret the assignment
        if (match) {
            var identifier = match[1];
            var value      = JSON.parse(match[3]);

            // add the assignment
            var assignment = {
                name:  identifier,
                value: value
            };

            assignments.push(assignment);
        }
    }

    // sanity check: if not UNSAT, there should be at least one assignment
    assert(assignments.length > 0, "a SAT formula should return an assignment");

    return assignments;
}

function saveProblem(problemString) {
    var deferred = Q.defer();

    fs.writeFile(INPUT_FILE_PATH, problemString, function (error) {
        if (error) {
            deferred.reject(error);
        } else {
            deferred.resolve(INPUT_FILE_PATH);
        }
    });

    return deferred.promise;
}

function saveProblemSync(problemString) {
    fs.writeFileSync(INPUT_FILE_PATH, problemString);
    return INPUT_FILE_PATH;
}

// public API
function solve(problemString) {

    // write the problem to the file
    return saveProblem(problemString).then(function (problemFilePath) {

        // fire up the solver
        var invocation = Z3_INVOCATION + " -f " + problemFilePath;
        var solverRun  = spawnPromise(invocation);

        return solverRun;

    // process output when the solver finishes
    }).then(function (stdout) {

        // parse and return the solution
        var solution = parseSolution(stdout);

        return solution;
    });
}

function solveSync(problemString) {

    // write the problem to the file
    var problemFilePath = saveProblemSync(problemString);

    // fire up the solver
    var invocation = Z3_INVOCATION + " -f " + problemFilePath;
    var stdout     = childProcess.execSync(invocation);

    // coerce the output to a string in case it's something else (like a Buffer)
    stdout = stdout.toString();

    // parse and return the solution
    var solution = parseSolution(stdout);

    return solution;
}

// exports
module.exports = {
    solveSync: solveSync,
    solve:     solve
};
