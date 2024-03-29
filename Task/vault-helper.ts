import tl = require('azure-pipelines-task-lib/task');
import util = require("./util.js");
import actions = require("./task-actions.js");

declare const Buffer: any

//Empty or Remark line
export function isIgnoredLine(line: string) {
    line = line.trim()
    return !line || line.length == 0 || line.startsWith('#')
}

export function massageLineHandling(line: string) {
    line = line.trim()

    if(line.startsWith('@')){
        console.log(line)
        return true
    }
    return false
}

export function variableLineHandling(line: string, var_list: {[index: string]: string;}){
    var regexIsVariableLine = /^([a-zA-Z])([a-zA-Z0-9_]*)(\s*)(<=)(\s*)[^\s]*$/g;
    if (regexIsVariableLine.exec(line) == null) 
        return false

    let arr = line.split("<=");
    let temp_key = arr[0].trim()
    let key = "{" + temp_key + "}" 
    let value = arr[1].trim()

    util.addVariable(var_list, key, value)
    return true
}

export async function actionLineHandling(index: number, line: string, var_list: {[index: string]: string;}, base_url: string, token: string, verifyCertificate: boolean): Promise<boolean>{
    var regexIsActionLine = /^(var|pre|raw|base64|json|yaml|rep|exp)(\s*=>\s*)(.*)(\s*=>\s*)(.*)(\s*=>\s*)([a-zA-Z][a-zA-Z0-9._]*)$/g;
    if(regexIsActionLine.exec(line) == null)
        return false

    let split_arr = line.split("=>");
            
    let type: string = split_arr[0].trim().toLowerCase();
    let secret_path: string = split_arr[1].trim();
    let field: string = split_arr[2].trim();
    let var_name: string = split_arr[3].trim();

    //update variable (field, path)
    ({ secret_path, field } = setValueInsteadOfTaskVar(var_list, secret_path, field));

    tl.debug(tl.loc("actionLine", index, type, secret_path, field, var_name));

    let path_detailes: any;
    try{
        path_detailes = await util.getKV2PathDetailes(base_url, secret_path, token, verifyCertificate);
        if(!path_detailes){
            tl.setResult(tl.TaskResult.Failed, tl.loc("emptySecret"));
            return true
        }
    }
    catch(error){
        tl.setResult(tl.TaskResult.Failed, tl.loc("getSecretFail", index, error.message));
        return true
    }

    try{
        switch(type){
            case "var":{
                actions.actionVar(path_detailes, field, index, type, var_name);
                break;
            }
            case "pre":{
                actions.actionPre(path_detailes, field, index, type, var_name);
                break;
            }
            case "raw":{
                actions.actionRaw(path_detailes, field, index, type, var_name);
                break;
            }
            case "base64":{
                actions.actionBase64(path_detailes, field, index, type, var_name);
                break;
            }
            case "json":{
                actions.actionJson(path_detailes, field, index, type, var_name, var_list);
                break
            }
            case "yaml":{
                actions.actionYaml(path_detailes, field, index, type, var_name, var_list);
                break
            }
            case "rep":{
                actions.actionReplace(path_detailes, field, index, type, var_name, var_list);
                break
            }
            case "exp":{
                actions.actionExport(path_detailes, field, index, type, var_name);
                break
            }
            default: { 
                tl.setResult(tl.TaskResult.Failed, tl.loc("actionTypeNotImplemented", index, type));
            } 
        }
    }
    catch(error){
        tl.error(error);
        tl.setResult(tl.TaskResult.Failed, tl.loc("UnknownErrorProcessType", index, type, error.message));
        tl.debug("Stack: " + error.stack)
    }
    return true
}

function setValueInsteadOfTaskVar(var_list: { [index: string]: string; }, secret_path: string, field: string) {
    for (let key in var_list) {
        let value = var_list[key];
        while (secret_path.includes(key)) {
            secret_path = secret_path.replace(key, value);
        }
        while (field.includes(key)) {
            field = field.replace(key, value);
        }
    }
    return { secret_path, field };
}
