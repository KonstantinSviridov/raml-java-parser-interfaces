/// <reference path="../typings/main.d.ts" />
import def=require("raml-definition-system")
import typeSystem = def.rt;
import td=require("ts-model")
import tsutil = td.tsutil
import util = require("./util")
import path = require("path")
import mkdirp = require("mkdirp")
import fs = require("fs")
import pluralize = require("pluralize")
import universeDef = def.universesInfo
import tsModel = require("ts-structure-parser")
//import helperMethodExtractor = tsModel.helperMethodExtractor
//
//
// var helperSources = {
//
//     "RAML10":{
//         "helper": {
//             "source": path.resolve(__dirname, "../node_modules/raml-1-parser/dist/raml1/wrapped-ast/wrapperHelper.d.ts"),
//             "import": "../node_modules/raml-1-parser/dist/raml1/wrapped-ast/wrapperHelper"
//         }
//     },
//     "RAML08":{
//         "helper": {
//             "source": path.resolve(__dirname, "../node_modules/raml-1-parser/dist/raml1/wrapped-ast/wrapperHelper08.d.ts"),
//             "import": "../node_modules/raml-1-parser/dist/raml1/wrapped-ast/wrapperHelper08"
//         }
//     }
// };


class ParserGenerator{

    constructor(private cfg:JavaParserGenerationConfig,private universe:def.Universe){}

    mod=new td.TSAPIModule();

    processed:{[name:string]:def.IType}={};

    //private helperMethods:{[key:string]:helperMethodExtractor.HelperMethod[]}={};

    //private helperSources:any;

    processEnum(u:def.EnumType){
        var typeName = u.nameId();
        u.superTypes().forEach(x=>this.processType(<def.IType>x));

        var dcl = new td.TSEnumDecl(this.mod,typeName);
        dcl.enumConstants = u.values;
        var typePath = path.basename(u['_path']);
        typePath = typePath.substring(0,typePath.lastIndexOf('.'));
        dcl.meta['$$pkg'] = typePath;

        u.subTypes().forEach(x=>this.processType(<def.IType>x));
    }

    processType(u:def.IType) {

        var isCustom = (<def.NodeClass>u).isCustom();

        var typeName = u.nameId();
        if (this.processed[typeName]){
            return;
        }
        this.processed[typeName]=u;

        if(u instanceof def.EnumType){
            this.processEnum(<def.EnumType>u);
            return;
        }

        u.superTypes().forEach(x=>this.processType(<def.IType>x));
        var idcl = new td.TSInterface(this.mod, typeName);
        var dcl = new td.TSClassDecl(this.mod, typeName + "Impl");

        var typePath = path.basename(u['_path']);
        typePath = typePath.substring(0,typePath.lastIndexOf('.'));
        idcl.meta['$$pkg'] = typePath;
        dcl.meta['$$pkg'] = typePath;
        dcl.implements.push(new td.TSSimpleTypeReference(td.Universe,idcl.name));

        if(u.hasValueTypeInHierarchy()){
            idcl.meta['$$isValueType'] = true;
            dcl.meta['$$isValueType'] = true;
        }
        if(typeName=='ValueType'){
            var valueComment = '@return Java representation of the node value';
            this.addInterfaceMethod(idcl, 'value', 'Object', valueComment);
            this.addImplementationMethod(dcl,'value', 'Object','return super.attributeValue();', valueComment).meta['property'] = 'value';
        }
        else if(typeName=='StringType'){
            var valueComment = '@return String representation of the node value';
            this.addInterfaceMethod(idcl, 'value', 'string', valueComment);
            this.addImplementationMethod(dcl,'value', 'string','return super.attributeValue();', valueComment).meta['property'] = 'value';
        }
        else if(typeName=='NumberType'){
            var valueComment = '@return Number representation of the node value';
            this.addInterfaceMethod(idcl, 'value', 'number', valueComment);
            this.addImplementationMethod(dcl,'value', 'number',`
        String strVal = super.attributeValue();
        return strVal != null ? Double.parseDouble(strVal) : null;`, valueComment).meta['property'] = 'value';
        }
        else if(typeName=='BooleanType'){
            var valueComment = '@return Boolean representation of the node value';
            this.addInterfaceMethod(idcl, 'value', 'boolean', valueComment);
            this.addImplementationMethod(dcl,'value', 'boolean',`
        String strVal = super.attributeValue();
        return strVal != null ? Boolean.parseBoolean(strVal) : null;`, valueComment).meta['property'] = 'value';
        }
        else if(typeName=='Reference'){
            this.addInterfaceMethod(idcl, 'value', 'string');
            this.addImplementationMethod(dcl,'value', 'string','return super.attributeValue();').meta['property'] = 'value';
            dcl.meta['$$noSuper'] = true;
            idcl.meta['$$noSuper'] = true;
        }
        else {
            var map:{[key:string]:boolean} = {};

            var superTypes:def.IType[] = u.superTypes().filter(x=> {
                if (map[x.nameId()]) {
                    return false;
                }
                map[x.nameId()] = true;
                return true;
            });

            var implementaionQueue:def.IType[] = [u].concat(this.extractSecondarySupertypes(u));
            superTypes.forEach(x=>idcl.extends.push(new td.TSSimpleTypeReference(td.Universe, x.nameId())) );
            if(superTypes.length>0){
                dcl.extends.push(new td.TSSimpleTypeReference(td.Universe, superTypes[0].nameId() + "Impl"))
            }
            var superTypeMethods:{[key:string]:def.IProperty[]} = {};
            superTypes.forEach(t=>{
                t.properties().forEach(p=>{
                    var arr:def.IProperty[] = superTypeMethods[p.nameId()];
                    if(!arr){
                        arr = [];
                        superTypeMethods[p.nameId()] = arr;
                    }
                    arr.push(p);
                });
                (<def.AbstractType>t).customProperties().forEach(p=>{
                    var arr:def.IProperty[] = superTypeMethods[p.nameId()];
                    if(!arr){
                        arr = [];
                        superTypeMethods[p.nameId()] = arr;
                    }
                    arr.push(p);
                });
            });
            map = {};
            u.properties().filter(x=> {

                var arr = superTypeMethods[x.nameId()];
                if(arr){
                    for(var p1 of arr){
                        if(p1.range().nameId()==x.range().nameId()){
                            return false;
                        }
                    }
                }

                if (map[x.nameId()]) {
                    return false;
                }
                map[x.nameId()] = true;
                return true;
            }).forEach(x=> {
                var iMethod = this.createMethodDecl(idcl, x);
                if(x.isValueProperty()){
                    iMethod.meta["$$isAttr"] = true;
                }
            });
            map = {};
            superTypes.forEach(t=>{
                t.properties().forEach(p=>map[p.nameId()]=true);
                (<def.AbstractType>t).customProperties().forEach(p=>map[p.nameId()]=true);
            });
            implementaionQueue.forEach(y=>y.properties().filter(x=> {

                var arr = superTypeMethods[x.nameId()];
                if(arr){
                    for(var p1 of arr){
                        if(p1.range().nameId()==x.range().nameId()){
                            return false;
                        }
                    }
                }
                    if (map[x.nameId()]) {
                        return false;
                    }
                    map[x.nameId()] = true;
                    return true;
                }).forEach(x=> {
                    var method = this.createMethodDecl(dcl, x);
                    method._body = this.generateBody(x, method);
                    if(x.isValueProperty()){
                        method.meta["$$isAttr"] = true;
                    }
            }));
            if (dcl.extends.length == 0 && !u.hasValueTypeInHierarchy()) {
                //idcl.extends.push(new td.TSSimpleTypeReference(td.Universe,"BasicNode"))
                //dcl.extends.push(new td.TSSimpleTypeReference(td.Universe,"BasicNodeImpl"))
            }
        }
        (<def.AbstractType>u).customProperties().forEach(x=> {
            this.createMethodDecl(idcl, x);
        });
        this.addHelperMethods(u,idcl);
        this.addHelperMethods(u,dcl,true);
        u.subTypes().forEach(x=>this.processType(<def.IType>x));
        //if(this.cfg.raml08compatible){
        //    this.handleRaml08Comapatibility(u,idcl,dcl);
        //}

        if(isCustom){
            idcl.meta["$$custom"] = true;
            this.mod.removeChild(dcl);
        }
    }

    private addHelperMethods(u:def.IType,decl:td.TSInterface,isImpl:boolean=false){

        //this.initHelpers(u);
        var methods;// = this.helperMethods[u.nameId()];
        if(!methods){
            return;
        }
        methods.forEach(m=>{

            if(m.meta.primary && !isImpl){
                return;
            }

            var existing = this.getExistingMethods(decl, m.wrapperMethodName);
            if(isImpl){
                existing.forEach(x=>x.name += '_original');
            }
            else{
                existing.forEach(x=>decl.removeChild(x));
            }
            var method = new td.TSAPIElementDeclaration(decl, m.wrapperMethodName);
            var comment = m.meta.comment;
            if(existing.length>0){
                method._comment = existing[0]._comment;
            }
            else if(comment && comment.trim().length>0) {
                method._comment = comment;
            }
            var returnType = this.createTypeForModel(m.returnType, method);
            method.isFunc = true;
            method.rangeType = returnType;
            m.callArgs().filter(x=>x.name!="this").forEach(x=>{

                if(!method.parameters){
                    method.parameters = [];
                }
                var paramType = this.createTypeForModel(x.type, method);
                method.parameters.push(new td.Param(method,x.name,td.ParamLocation.OTHER,paramType));
            });

            if(isImpl){
                method._body = `
            return WrapperHelper.${m.originalName}(${m.callArgs().map(x=>x.name).join(', ')});
        `;
            }
        });
    }

    private addInterfaceMethod(
        idcl:td.TSInterface,
        methodName:string,
        returnTypeName:string,
        comment?:string):td.TSAPIElementDeclaration {

        var existing = this.getExistingMethods(idcl, methodName);
        existing.forEach(x=>idcl.removeChild(x));
        var method = new td.TSAPIElementDeclaration(idcl, methodName);
        method.isFunc = true;
        method.rangeType = new td.TSSimpleTypeReference(method, returnTypeName);
        if(comment && comment.trim().length>0) {
            method._comment = comment;
        }
        else if(existing.length>0){
            method._comment = existing[0]._comment;
        }
        return method;
    }

    private addImplementationMethod(
        dcl:td.TSInterface,
        methodName:string,
        returnTypeName:string,
        body:string,
        comment?:string):td.TSAPIElementDeclaration {

        var existing = this.getExistingMethods(dcl, methodName);
        existing.forEach(x=>dcl.removeChild(x));
        var method = this.addInterfaceMethod(dcl, methodName, returnTypeName);
        method._body = body;
        if(comment && comment.trim().length>0) {
            method._comment = comment;
        }
        else if(existing.length>0){
            method._comment = existing[0]._comment;
        }
        return method;
    }

    private getExistingMethods(idcl, methodName):td.TSAPIElementDeclaration[] {
        var arr:td.TSAPIElementDeclaration[] = [];
        idcl.children().filter(x=> {
            if (!(x instanceof td.TSAPIElementDeclaration)) {
                return false;
            }
            var m:td.TSAPIElementDeclaration = <td.TSAPIElementDeclaration>x;
            return m.name == methodName;
        }).forEach(x=>arr.push(x));
        return arr;
    }

    private createTypeForModel(typeModel, method):td.TSTypeReference<any> {

        var rt:td.TSTypeReference<any>;
        if (typeModel) {

            var result:td.TSTypeReference<any>;
            var arrDepth = 0;
            while(typeModel.typeKind==tsModel.TypeKind.ARRAY){
                typeModel = (<tsModel.ArrayType>typeModel).base;
                arrDepth++;
            }
            if(typeModel.typeKind==tsModel.TypeKind.BASIC){
                var bt = (<tsModel.BasicType>typeModel);

                var str = bt.basicName;
                if(this.typeMap[str]!=null){
                    str = this.typeMap[str];
                }
                var result1 = new td.TSSimpleTypeReference(method,str);
                //var nameSpace = bt.nameSpace && bt.nameSpace.trim();
                //if(nameSpace!=null && nameSpace.length>0 && nameSpace!="RamlWrapper"){
                //    str = nameSpace + "." + str;
                //}
                if(bt.typeArguments && bt.typeArguments.length!=0){
                    result1.typeParameters = [];
                    bt.typeArguments.forEach(x=>{
                        result1.typeParameters.push(this.createTypeForModel(result,x));
                    });
                }
                //if(namespaces) {
                //    if (bt.nameSpace) {
                //        return namespaces[bt.nameSpace] ? [ str ] : [];
                //    }
                //    else{
                //        return [];
                //    }
                //}
                //return [ str ];
                result = result1;
            }
            else{
                throw new Error("Union types not suppored for Java parser");
            }

            for(var i = 0 ; i < arrDepth ; i++){
                var aRef = new td.TSArrayReference();
                aRef.componentType = result;
                result = aRef;
            }

            return result;
        }
        if (!rt) {
            rt = new td.TSSimpleTypeReference(method, "void");
        }
        return rt;
    }

    //private handleRaml08Comapatibility(u:def.IType,idcl:td.TSInterface,dcl:td.TSInterface){
    //
    //    if(u.name()=='ObjectField'){
    //        var deType = this.universe.getType('DataElement');
    //        var prop:def.Property = def.prop(
    //            'formParameters','return form parameters',<def.NodeClass>deType,<def.IType>deType).withMultiValue(true);
    //        this.createMethodDecl(idcl, prop);
    //        var z = this.createMethodDecl(dcl, prop);
    //        z._body = this.generateBody(prop, z, 'properties');
    //    }
    //}

    private generateBody(x:typeSystem.nominalTypes.IProperty,method:td.TSAPIElementDeclaration,propName?:string) {
        var isEnum = this.processed[x.range().nameId()] instanceof def.EnumType;
        var resolvedType = resolveArray(method.rangeType,!isEnum);
        if(!propName) {
            propName = x.nameId();
        }
        if (x.isValueProperty()){
            var args = [ `"${propName}"` ];
            var rangeType = x.range().nameId();
            if(x.isPrimitive()||rangeType=='AnyType'){
                rangeType = this.typeMap[rangeType];
                if(rangeType!='StructuredValue'){
                    rangeType += 'Value';
                }
                args.push('null');
                args.push(`"to${util.firstToUpper(rangeType)}"`);
            }
            else{
                if(!isEnum){
                    rangeType += 'Impl';
                }
                args.push(`${rangeType}.class`);
                args.push('null');
            }
            if(x.isMultiValue()) {
                return `return (List)super.attributes(${args.join(', ')});`;
            }
            else{
                return `return super.attribute(${args.join(', ')});`;
            }
        }
        else{
            if (x.isMultiValue()){
                return `return (List)super.elements("${propName}");`;
            }
            else{
                return `return super.element("${propName}");`;
            }
        }
    }

    extractSecondarySupertypes(type:def.IType):def.IType[]{

        var superTypes = type.superTypes();
        if(superTypes.length<2){
            return [];
        }
        var map:{[key:string]:boolean}={};
        var arr:def.IType[] = [ superTypes[0] ];
        for(var i = 0 ; i < arr.length ; i++){
            map[arr[i].nameId()] = true;
            arr[i].superTypes().filter(x=>!map[x.nameId()]).forEach(x=>arr.push(x));
        }
        var result = superTypes.filter(x=>!map[x.nameId()]);
        for(var i = 0 ; i < result.length ; i++){
            result[i].superTypes().filter(x=>!map[x.nameId()]).forEach(x=>result.push(x));
        }
        return result;
    }

    private typeMap:{[key:string]:string} = {
        'StringType' : 'string',
        'NumberType' : 'number',
        'BooleanType' : 'boolean',
        'AnyType' : 'Object'
    }

    private createMethodDecl(dcl:td.TSInterface, x:typeSystem.nominalTypes.IProperty):td.TSAPIElementDeclaration {
        var method = new td.TSAPIElementDeclaration(dcl, x.nameId());
        method.meta['property'] = x.nameId();
        method.isFunc = true;
        var tname:string = "string";
        if(x.isPrimitive()||x.range().nameId()=='AnyType'){
            tname = this.typeMap[x.range().nameId()];
            if(!tname){
                tname = x.range().nameId();
                this.processType(x.range());
            }
        }
        else {
            tname = x.range().nameId();
            this.processType(x.range());
        }
        var iOpt = this.mod.getInterface(tname);
        var ref = iOpt != null ? iOpt.toReference() : new td.TSSimpleTypeReference(td.Universe, tname);
        if(x.isMultiValue()){
            var aRef = new td.TSArrayReference();
            aRef.componentType = ref;
            method.rangeType = aRef;
        }
        else {
            method.rangeType = ref;
        }
        method._comment = x.description() ? x.description().trim() : null;
        return method
    }

    // initHelpers(u:def.IType){
    //
    //     if(this.helperMethods){
    //         return;
    //     }
    //     this.helperMethods = {};
    //     var ver = u.universe().version();
    //     this.helperSources = helperSources[this.universe.version()];
    //
    //     if(!this.helperSources){
    //         return;
    //     }
    //
    //     Object.keys(this.helperSources).forEach(src=> {
    //
    //         var sourcePath = this.helperSources[src]['source'];
    //         if(!sourcePath){
    //             return;
    //         }
    //
    //         var methods:helperMethodExtractor.HelperMethod[] =
    //             helperMethodExtractor.getHelperMethods(sourcePath);
    //
    //         methods.forEach(x=> {
    //             if(this.cfg.ignoreInSufficientHelpers){
    //                 if(!(x.meta.override||x.meta.primary)){
    //                     return;
    //                 }
    //             }
    //             x.targetWrappers().forEach(n=> {
    //                 var arr = this.helperMethods[n];
    //                 if (!arr) {
    //                     arr = [];
    //                     this.helperMethods[n] = arr;
    //                 }
    //                 arr.push(x);
    //             });
    //         });
    //     });
    // }

}

export interface JavaParserGenerationConfig{

    rootPackage:string

    sourceFolderAbsolutePath:string

    ramlVersion:string

    generateImplementation:boolean

    ignoreInSufficientHelpers:boolean

    generateRegistry:boolean

    corePackage:string
}

export function def2Parser(u:def.IType,cfg:JavaParserGenerationConfig,universe:def.Universe){
    var generator=new ParserGenerator(cfg,universe);
    generator.processType(u);
    new Serializer(generator.mod,cfg).serializeAll();
}

class ImplementationGenerator {

    generatedCode:string[];


    generateASTAccessor(p:def.Property){
        this.generatedCode.push(`var val=this.ast.getValue(${p.nameId()}}`)
        this.generatedCode.push(`return new ${p.range().nameId()}Impl(val)`)
    }
}

class Serializer{

    constructor(protected module:td.TSAPIModule, protected cfg:JavaParserGenerationConfig){}

    private pkgMap:{[key:string]:string} = {}

    serializeAll(){
        this.module.children().forEach(x=> {

            if (x instanceof td.TSClassDecl){
                if(this.cfg.generateImplementation){
                    this.pkgMap[x.name] = this.cfg.rootPackage + '.impl.' + x.meta['$$pkg'];
                }
            }
            else{
                this.pkgMap[x.name] = this.cfg.rootPackage + '.model.' + x.meta['$$pkg'];
            }
        });
        this.serializeModelFactory();
        this.module.children().forEach(x=>this.serializeElement(x));
    }


    serializeElement(model:td.TSModelElement<any>){

        if(model instanceof td.TSEnumDecl){
            this.serializeEnum(<td.TSEnumDecl>model);
        }
        else if(model instanceof td.TSClassDecl){
            if(this.cfg.generateImplementation) {
                this.serializeImplementation(<td.TSClassDecl>model);
            }
        }
        else if(model instanceof td.TSInterface){
            this.serializeInterface(<td.TSInterface>model);
        }
    }

    serializeEnum(model:td.TSEnumDecl){

        var currentPackage = this.pkgMap[model.name];
        var content = `package ${ currentPackage};

public enum ${model.name} {

${model.enumConstants.map(x=>'    '+x).join(',\n')}

}`;
        this.write(content,model.name + '.java',currentPackage);

    }


    serializeInterface(model:td.TSInterface){

        var currentPackage = this.pkgMap[model.name];

        var isValueNode = model.meta['$$isValueType'];

        var hasArrays = model.children().filter(x=>x.rangeType&&x.rangeType.array()).length>0;
        var imports:{} = hasArrays ? {'import java.util.List;':true} : {};
        if(model.extends.length==0){
            if(!model.meta["$$custom"]) {
                if (isValueNode) {
                    imports[`import ${this.cfg.corePackage}.AttributeNode;`] = true;
                }
                else {
                    imports[`import ${this.cfg.corePackage}.BasicNode;`] = true;
                }
            }
        }

        var defaultExtends = "";
        if(!model.meta["$$custom"]){
            defaultExtends = isValueNode ? 'extends AttributeNode' : 'extends BasicNode';
        }
        var extendsString = this.refsArrayToString(model.extends, "extends", defaultExtends);

        var childMethods = model.children().filter(x=>x instanceof  td.TSAPIElementDeclaration);
        var methods:string[] = childMethods.map(x => this.interfaceMethodString(<td.TSAPIElementDeclaration>x));




        //if(childMethods.length>0){
        //    imports['import javax.xml.bind.annotation.XmlElement;'] = true;
        //}

        //if(model.extends.length==0) {
        //    imports[`import ${this.cfg.rootPackage}.core.${isValueNode
        //        ?'IJavaAttributeNode':`IJavaElementNode`};`] = true;
        //}

        model.extends.filter(x=>this.pkgMap[resolveArray(x)]!=currentPackage)
           .forEach(x=>this.appendImport(x, imports));

        model.children()
            .filter(x=>!this.hasPrimitiveReturnType(x)&&this.pkgMap[resolveArray(x.rangeType)]!=currentPackage)
            .forEach(x=>this.appendImport(x.rangeType, imports));

        var content = `package ${ currentPackage};

${Object.keys(imports).length>0 ? Object.keys(imports).sort().join('\n')+'\n\n\n':''}
public interface ${model.name} ${extendsString} {

${methods.join('\n\n\n')}

}`;
        this.write(content,model.name + '.java',currentPackage);
    }


    refsArrayToString(arr:td.TSTypeReference<any>[], keyWord:string, defVal:string = ''):string{
        return (arr && arr.length > 0)
            ? keyWord + arr.map(x=>x.serializeToString()).map(x=>' '+x).join(',') : defVal;
    }


    interfaceMethodString(method:td.TSAPIElementDeclaration):string{
        return `${this.methodString(method,true)};`
    }


    serializeImplementation(model:td.TSClassDecl){

        var currentPackage = this.pkgMap[model.name];
        var isValueNode = model.meta['$$isValueType'];

        var hasArrays = model.children().filter(x=>x.rangeType&&x.rangeType.array()).length>0;
        var imports:{} = hasArrays ? {'import java.util.List;':true} : {};

        if (isValueNode) {
            if (model.extends.length == 0) {
                imports[`import ${this.cfg.corePackage}.AttributeNodeImpl;`] = true;
            }
            imports[`import com.mulesoft.ast.high.level.model.IAttribute;`] = true;
        }
        else {
            if (model.extends.length == 0) {
                imports[`import ${this.cfg.corePackage}.BasicNodeImpl;`] = true;
            }
            imports['import com.mulesoft.ast.high.level.model.IHighLevelNode;'] = true;
        }

        var extendsString = this.refsArrayToString(model.extends, "extends",
            isValueNode?'extends AttributeNodeImpl':'extends BasicNodeImpl');

        var implementsString = this.refsArrayToString(model.implements, "implements");

        var methods:string[] = model.children().filter(x=>x instanceof  td.TSAPIElementDeclaration)
    .map(x => this.implementationMethodString(<td.TSAPIElementDeclaration>x));

        methods.forEach(m=>{
            if(m.indexOf("WrapperHelper.")>=0){
                imports[`import ${this.cfg.rootPackage}.helper.WrapperHelper;`] = true;
            }
        });


        //imports['import javax.xml.bind.annotation.XmlElement;'] = true;
        //imports[`import ${this.cfg.corePackage}.BasicNodeImpl;`] = true;
        //imports[`import ${this.cfg.rootPackage}.core.JavaNodeFactory;`] = true;
        //if(model.extends.length==0) {
        //    imports[`import ${this.cfg.rootPackage}.core.${isValueNode
        //        ?'JavaAttributeNode':`JavaElementNode`};`] = true;
        //}
        //else{
            model.extends.filter(x=>this.pkgMap[resolveArray(x)]!=currentPackage)
                .forEach(x=>this.appendImport(x, imports));
        //}

        model.implements.forEach(x=>this.appendImport(x, imports));
        model.children()
            .filter(x=>!this.hasPrimitiveReturnType(x)
            &&this.pkgMap[resolveArray(x.rangeType)]!=currentPackage)
            .forEach(x=>this.appendImport(x.rangeType, imports, x.meta["$$isAttr"]));

        var content = `package ${ currentPackage};

${Object.keys(imports).length>0 ? Object.keys(imports).sort().join('\n')+'\n\n\n':''}
public class ${model.name} ${extendsString} ${implementsString} {

    public ${model.name}(${isValueNode?'IAttribute attr':'IHighLevelNode node'}){
        super(${isValueNode?'attr':'node'});
    }


${methods.join('\n\n\n')}
}`;
        this.write(content,model.name + '.java',currentPackage);
    }

    private appendImport(x:td.TSTypeReference<any>, imports, addImpl:boolean=false) {
        var n = resolveArray(x);
        if(n=='Object'){
            return;
        }
        imports[this.importString(n)] = true;

        var isEnum = checkEnum(x);
        if(!isEnum && addImpl && n!=customTypeSuperclass && n!= "ITypeDefinition"){
            imports[this.importString(n + 'Impl',true)] = true;
        }
    }

    private importString(n:string, isImpl:boolean = false):string {

        if(n==customTypeSuperclass){
            return `import ${this.cfg.corePackage}.custom.${customTypeSuperclass};`;
        }
        else if(n=="ITypeDefinition"){
            return "import com.mulesoft.definition.system.model.ITypeDefinition;";
        }
        else if(n=="NodeMetadata"||n=="ValueMetadata"){
            return `import ${this.cfg.corePackage}.${n};`;
        }

        var subPackage:string = (n == customTypeSuperclass) ? 'core' : (isImpl ? 'impl' : 'model');
        var pkg = this.pkgMap[n] ? this.pkgMap[n] : `${this.cfg.rootPackage}.${subPackage}`;
        var importStr = `import ${pkg}.${n};`;
        return importStr;
    }


    implementationMethodString(method:td.TSAPIElementDeclaration):string{
        return`${this.methodString(method)}{
        ${method._body}
    }`
    }

    methodString(method:td.TSAPIElementDeclaration,isOfInterface:boolean=false):string{
        var comment = "";
        if(method.comment()!=null){
            var mc = method._comment.replace(/\//g,'&#47;');
            comment = "    /**\n" + mc.split("\n").map(x=>"     * " + x + "\n").join('') + "     **/\n";
        }
        var returnType = mapReturnType(method);
        if(!returnType) {
            returnType = getReturnTypeString(method.rangeType);
        }
        var methodName = escapeMethodName(method.name);
        var paramStr = "()";
        if(method.parameters){
            paramStr = "(" + method.parameters.map(x=>paramString(x)).join(", ").trim() + ")";
        }
        return comment + `    ${isOfInterface?'':'public'} ${returnType} ${methodName}${paramStr}`;
    }


    write(content:string,name:string,pkg:string){
        var dstPath = path.resolve(path.resolve(this.cfg.sourceFolderAbsolutePath,this.packagePath(pkg)),name);
        mkdirp.sync(path.dirname(dstPath));
        fs.writeFileSync(dstPath,content);
    }

    private packagePath(pkg:string):string{
        return pkg.replace(/\./g,'/');
    }


    private hasPrimitiveReturnType(method:td.TSAPIElementDeclaration):boolean{
        var isArray = method.rangeType.array();
        var rangeType = isArray
        ? (<td.TSArrayReference>method.rangeType).componentType
    : method.rangeType ;

        var returnType = rangeType.serializeToString();
        return tsutil.tsToJavaTypeMap[returnType] != null;
    }

    private serializeModelFactory(){

        if(!this.cfg.generateRegistry){
            return;
        }

        var currentPackage = this.cfg.rootPackage + '.registry';
        var className = 'ModelRegistry';

        var content = `package ${currentPackage};

import java.util.HashMap;
import java.util.List;
import java.util.ArrayList;
import java.util.Arrays;

import com.mulesoft.definition.system.init.IModelRegistry;

public class ${className}  implements IModelRegistry  {

    protected static ${className} instance;

    public static ${className} getInstance(){
        if(instance==null){
            instance = new ${className}();
        }
        return instance;
    }


    protected ${className}(){
        this.init();
    }

    public String rootPackage(){
        return "${this.cfg.rootPackage}";
    }

    protected HashMap<String,String> packageMap;

    protected List<Class> modelClasses;

    public List<Class> getModelClasses() {
		return modelClasses;
	}

    @SuppressWarnings("unchecked")
	public <S> Class<? extends S> getModelClass(String simpleName, Class<S> clazz){
        String pkg = this.packageMap.get(simpleName);
        if(pkg==null){
            return null;
        }
        String qualifiedName = pkg + "." + simpleName;
        try {
            Class<?> result = this.getClass().getClassLoader().loadClass(qualifiedName);
            if(result!=null && clazz.isAssignableFrom(result)){
            	return (Class<? extends S>) result;
            }
        }
        catch(Exception e){}

        return null;
    }

    protected void init(){

        this.packageMap = new HashMap<String,String>();

        this.modelClasses = new ArrayList<Class>(Arrays.asList(
${Object.keys(this.pkgMap).map(x=>`            ${this.pkgMap[x]}.${x}.class`).join(',\n')}
        ));

    }


	public String version() {
		return "${this.cfg.ramlVersion}";
	}


}`;
        this.write(content,className + '.java',currentPackage);
    }

}


function getReturnTypeString(rangeType:td.TSTypeReference<any>):string{
    var returnType = resolveArray(rangeType);
    return rangeType.array() ? `List<${returnType}>` : returnType;
}

function paramString(param:td.Param):string{
    var returnType = resolveArray(param.ptype);
    return returnType + " " + param.name;
}

function resolveArray(rangeType:td.TSTypeReference<any>,toImpl:boolean=false):string{
    var isArray = rangeType.array();
    rangeType = isArray
        ? (<td.TSArrayReference>rangeType).componentType
        : rangeType ;

    var returnType = rangeType.serializeToString();
    var converted = tsutil.tsToJavaTypeMap[returnType];
    if(converted){
        return converted;
    }
    return toImpl ? returnType + 'Impl':returnType;
}

function checkEnum(rangeType:td.TSTypeReference<any>):boolean{

    var isArray = rangeType.array();
    rangeType = isArray
        ? (<td.TSArrayReference>rangeType).componentType
        : rangeType ;

    var isEnum = rangeType instanceof td.TSDeclaredInterfaceReference
        && (<td.TSDeclaredInterfaceReference>rangeType).getOriginal()
        instanceof td.TSEnumDecl;

    return isEnum;
}

export class UserClass{
    constructor(simpleName:string, qualifiedName:string) {
        this.simpleName = simpleName;
        this.qualifiedName = qualifiedName;
    }

    simpleName:string;
    qualifiedName:string;
    content:string;
}

export class UserClassCollection{


    protected classes:{[key:string]:UserClass} = {};

    getClasses():UserClass[]{
        return Object.keys(this.classes).map(x=>this.classes[x]);
    }

    hasClass(qName:string):boolean{
        return this.classes[qName]!=null;
    }

    addClass(cl:UserClass){
        this.classes[cl.qualifiedName] = cl;
    }

    getClass(qName:string):UserClass{
        return this.classes[qName];
    }
}

var customTypeSuperclass:string = 'CustomType';


export function escapeMethodName(str:string) {
    
    var mapped = methodNamesMap[str];
    if(mapped!=null){
        return mapped;
    }
    return tsutil.escapeToJavaIdentifier(str);
}

var returnTypesMap;
function initReturnTypesMap(){

    if(returnTypesMap){
        return;
    }

    returnTypesMap = {};
    var strMap = {};
    strMap[def.universesInfo.Universe10.StringTypeDeclaration.properties.minLength.name] = "Integer";
    strMap[def.universesInfo.Universe10.StringTypeDeclaration.properties.maxLength.name] = "Integer";
    returnTypesMap[def.universesInfo.Universe10.StringTypeDeclaration.name] = strMap;

    var objMap = {};
    objMap[def.universesInfo.Universe10.ObjectTypeDeclaration.properties.minProperties.name] = "Integer";
    objMap[def.universesInfo.Universe10.ObjectTypeDeclaration.properties.maxProperties.name] = "Integer";
    returnTypesMap[def.universesInfo.Universe10.ObjectTypeDeclaration.name] = objMap;

    var arrMap = {};
    arrMap[def.universesInfo.Universe10.ArrayTypeDeclaration.properties.minItems.name] = "Integer";
    arrMap[def.universesInfo.Universe10.ArrayTypeDeclaration.properties.maxItems.name] = "Integer";
    returnTypesMap[def.universesInfo.Universe10.ArrayTypeDeclaration.name] = arrMap;

    var fileMap = {};
    fileMap[def.universesInfo.Universe10.FileTypeDeclaration.properties.minLength.name] = "Long";
    fileMap[def.universesInfo.Universe10.FileTypeDeclaration.properties.maxLength.name] = "Long";
    returnTypesMap[def.universesInfo.Universe10.FileTypeDeclaration.name] = fileMap;
}

function mapReturnType(method:td.TSAPIElementDeclaration):string{
    initReturnTypesMap();

    var methodName = method.name;
    var type = <td.TSInterface>method.parent();
    var typeName = type.name;

    var typeMap = returnTypesMap[typeName];
    if(!typeMap){
        return null;
    }
    return typeMap[methodName];
}

var methodNamesMap = {
    "enum": "enumValues",
    "default": "defaultValue",
    "extends": "extendsApi"
}
