import path = require('path');
import tl = require('azure-pipelines-task-lib/task');
import util = require("./util.js");
import helper = require("./vault_helper.js")

//import toolLib = require("azure-pipelines-tool-lib/tool");

async function run() {
    try{
        tl.setResourcePath(path.join(__dirname, 'task.json'));

        //Get User/Password from serviceEndpoint:Generic
        var input_serviceDetails = tl.getInput('vaultService', true);
        let serviceEndpoint: tl.EndpointAuthorization = tl.getEndpointAuthorization(input_serviceDetails, true);
        let vaultUser: string = serviceEndpoint.parameters['username'];
        let vaultPass: string = serviceEndpoint.parameters['password'];
        let loginType: string = "ldap"

        if(vaultUser.includes('\\')){
            let arr = vaultUser.split('\\')
            loginType = arr[0]
            vaultUser = arr[1]
        }

        let base_url = tl.getEndpointUrl(input_serviceDetails, false);

        let validLoginType = [ "ldap", "userpass", "token" ]
        if(!validLoginType.includes(loginType)){
            tl.setResult(tl.TaskResult.Failed, tl.loc("loginTypeNotValid"));
            return
        }

        if (!vaultUser || !vaultPass || !base_url || !loginType) {
            tl.setResult(tl.TaskResult.Failed, tl.loc("serviceDetailsMissing"));
            return
        }
        
        try{

            const token: string = (loginType == "token") ? vaultPass : await util.getVaultToken(base_url, loginType, vaultUser, vaultPass);
            let array
            var var_list: {[index: string]: string;} = {}; // create an empty dictionary
            const input_sourceType = tl.getInput("sourceType")
            if(input_sourceType == "inline"){
                var input_data = tl.getInput('data', true);
                array = input_data.split(/\r\n|\r|\n/);
                handle(base_url, token, "full", array, var_list)
            }
            else if(input_sourceType == "filePath"){
                var input_variable = tl.getInput('variableData', true);
                let var_array = input_variable.split(/\r\n|\r|\n/);
                handle(base_url, token, "variable", var_array, var_list)

                var input_filePath = tl.getPathInput("filePath", true)
                array = util.readFromFile(input_filePath)
                handle(base_url, token, "full", array, var_list)
            }
            else{
                tl.setResult(tl.TaskResult.Failed, "sourceType not valid - " + input_sourceType);
                return
            }
        }
        catch(error){
            tl.error(error);
            tl.setResult(tl.TaskResult.Failed, tl.loc("tokenFail"));
        }
    }
    catch(error){
        tl.setResult(tl.TaskResult.Failed, error.message || 'run() failed', true);
    }
    
}

async function handle(base_url: string, token: string, type: string, array, var_list: {[index: string]: string}){
    for (var i = 0; i < array.length; i++) {
		let index = i + 1
		let line: string = array[i].trim();

        if(helper.isIgnoredLine(line) || 
            helper.massageLineHandling(line))
            continue;
        
        if(helper.variableLineHandling(index, line, var_list)){
            continue
        }
        else if(type == "full" && await helper.actionLineHandling(index, line, var_list, base_url, token)){
            continue
        }
        else{
            tl.setResult(tl.TaskResult.Failed, tl.loc("unknownLineFormat"));            
        }
	}
}

run();
