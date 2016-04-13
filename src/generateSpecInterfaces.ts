/**
 * Generates spec interfaces for Java RAML 1.0 and 0.8 parser.
 * 
 * Command line parameters:
 * -dstPath location of the target workspace. Default is ./java/nativeParser in the 'api-workbench' project
 *
 **/

/// <reference path="../typings/main.d.ts" />

import javaNativeParserWrappersGenerator = require("./javaNativeParserWrappersGenerator");
import path = require("path");
import def = require("raml-definition-system");
import universeDef = def.universesInfo;
import util = require("./util");
import fsutil = require("./fsutil");

var DEFAULT_DST = path.resolve(__dirname,"../java");
var STATIC_CORE_DIR = path.resolve(__dirname,"../staticCode");
var PARENT_PROJECT = "spec-model";

var SPEC_PROJECT_NAME_10 = 'raml-spec-model-1.0';

var SPEC_PROJECT_NAME_08 = 'raml-spec-model-0.8';

var ROOT_SPEC_PACKAGE_10 = "org.raml";

var ROOT_SPEC_PACKAGE_08 = "org.raml";

var CORE_PACKAGE = "org.raml.model.core";

function generate( _dstWSPath:string, corePackage )
{
    var parentProjectPathDst = path.resolve(_dstWSPath,PARENT_PROJECT);
    var parentProjectPathSrc = path.resolve(STATIC_CORE_DIR,PARENT_PROJECT);
    fsutil.copyDirSyncRecursive(parentProjectPathDst,parentProjectPathSrc);

    var universe10 = def.getUniverse("RAML10");
    var apiType10= universe10.type(universeDef.Universe10.Api.name);


    var raml10SrcFolder = path.resolve(parentProjectPathDst, `${SPEC_PROJECT_NAME_10}/src/main/java`);
    var wrapperConfig10 = {
        rootPackage: ROOT_SPEC_PACKAGE_10,
        sourceFolderAbsolutePath: raml10SrcFolder,
        ramlVersion: "RAML10",
        generateImplementation:false,
        ignoreInSufficientHelpers:true,
        generateRegistry:false,
        corePackage: corePackage
    };
    javaNativeParserWrappersGenerator.def2Parser(apiType10, wrapperConfig10, universe10);

    var universe08 = def.getUniverse("RAML08");
    var apiType08= universe08.type(universeDef.Universe08.Api.name);

    var raml08SrcFolder = path.resolve(parentProjectPathDst, `${SPEC_PROJECT_NAME_08}/src/main/java`);
    var wrapperConfig08 = {
        rootPackage: ROOT_SPEC_PACKAGE_08,
        sourceFolderAbsolutePath: raml08SrcFolder,
        ramlVersion: "RAML08",
        generateImplementation:false,
        ignoreInSufficientHelpers:true,
        generateRegistry:false,
        corePackage: corePackage
    };
    javaNativeParserWrappersGenerator.def2Parser(apiType08, wrapperConfig08, universe08);

    var originalCoreSrc = path.resolve(STATIC_CORE_DIR,"corePackage");

    var contentPatternReplacements:fsutil.PatternReplacementSet = {
        ".java$": {
            "map": {
                "__core_package__": corePackage
            }
        }
    };
    var pathMap:{[key:string]:string} = {
        "__core_package__": corePackage.replace(/\./g, "/")
    };
    var replacementOptions = {
        contentPatternReplacements: contentPatternReplacements,
        pathReplacements: pathMap
    };

    fsutil.copyDirSyncRecursive(raml10SrcFolder,originalCoreSrc, replacementOptions);
    fsutil.copyDirSyncRecursive(raml08SrcFolder,originalCoreSrc, replacementOptions);
}

var dstWorkspacePath;
var rootPackage;

var args:string[] = process.argv;
for(var i = 0 ; i < args.length ; i++){
    if(args[i]=='-dstPath' && i < args.length-1){
        dstWorkspacePath = args[i+1];
    }
    else if(args[i]=='-rootPackage' && i < args.length-1){
        rootPackage = args[i+1];
    }
}

if(!dstWorkspacePath){
    dstWorkspacePath = DEFAULT_DST;
}
if(!rootPackage){
    rootPackage = CORE_PACKAGE;
}


generate( dstWorkspacePath, rootPackage );