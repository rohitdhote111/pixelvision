import '../css/EditTaskForm.scss';
import React from 'react';
import values from 'object.values';
import Utils from '../classes/Utils';
import EditPresetDialog from './EditPresetDialog';

if (!Object.values) {
    values.shim();
}

class EditTaskForm extends React.Component {
  static defaultProps = {
    selectedNode: null,
    task: null
  };

  static propTypes = {
      selectedNode: React.PropTypes.oneOfType([
        React.PropTypes.string,
        React.PropTypes.number
      ]),
      onFormLoaded: React.PropTypes.func,
      task: React.PropTypes.object
  };

  constructor(props){
    super(props);

    this.namePlaceholder = "Task of " + (new Date()).toISOString();

    this.state = {
      error: "",
      name: props.task !== null ? (props.task.name || "") : "",
      loadedProcessingNodes: false,
      loadedPresets: false,

      selectedNode: null,
      processingNodes: [],
      selectedPreset: null,
      presets: []
    };

    this.handleNameChange = this.handleNameChange.bind(this);
    this.handleSelectNode = this.handleSelectNode.bind(this);
    this.loadProcessingNodes = this.loadProcessingNodes.bind(this);
    this.retryLoad = this.retryLoad.bind(this);
    this.selectNodeByKey = this.selectNodeByKey.bind(this);
    this.getTaskInfo = this.getTaskInfo.bind(this);
    this.notifyFormLoaded = this.notifyFormLoaded.bind(this);
    this.loadPresets = this.loadPresets.bind(this);
    this.handleSelectPreset = this.handleSelectPreset.bind(this);
    this.selectPresetById = this.selectPresetById.bind(this);
    this.handleEditPreset = this.handleEditPreset.bind(this);
  }

  notifyFormLoaded(){
    if (this.props.onFormLoaded && 
        this.state.loadedPresets && 
        this.state.loadedProcessingNodes) this.props.onFormLoaded();
  }

  loadProcessingNodes(){
    function failed(){
      // Try again
      setTimeout(loadProcessingNodes, 1000);
    }

    this.nodesRequest = 
      $.getJSON("/api/processingnodes/?has_available_options=True", json => {
        if (Array.isArray(json)){
          // No nodes with options?
          const noProcessingNodesError = (nodes) => {
            var extra = nodes ? "We tried to reach:<ul>" + nodes.map(n => Utils.html`<li><a href="${n.url}">${n.label}</a></li>`).join("") + "</ul>" : "";
            this.setState({error: `There are no usable processing nodes. ${extra}Make sure that at least one processing node is reachable and
             that you have granted the current user sufficient permissions to view 
             the processing node (by going to Administration -- Processing Nodes -- Select Node -- Object Permissions -- Add User/Group and check CAN VIEW PROCESSING NODE).
             If you are bringing a node back online, it will take about 30 seconds for WebODM to recognize it.`});
          };

          if (json.length === 0){
            noProcessingNodesError();
            return;
          }

          let now = new Date();

          let nodes = json.map(node => {
            return {
              id: node.id,
              key: node.id,
              label: `${node.hostname}:${node.port} (queue: ${node.queue_count})`,
              options: node.available_options,
              queue_count: node.queue_count,
              enabled: node.online,
              url: `http://${node.hostname}:${node.port}`
            };
          });

          let autoNode = null;

          // If the user has selected auto, and a processing node has been assigned
          // we need attempt to find the "auto" node to be the one that has been assigned
          if (this.props.task && this.props.task.processing_node && this.props.task.auto_processing_node){
            autoNode = nodes.find(node => node.id === this.props.task.processing_node);
          }

          if (!autoNode){
            // Find a node with lowest queue count
            let minQueueCount = Math.min(...nodes.filter(node => node.enabled).map(node => node.queue_count));
            let minQueueCountNodes = nodes.filter(node => node.enabled && node.queue_count === minQueueCount);

            if (minQueueCountNodes.length === 0){
              noProcessingNodesError(nodes);
              return;
            }

            // Choose at random
            autoNode = minQueueCountNodes[~~(Math.random() * minQueueCountNodes.length)];
          }

          nodes.unshift({
            id: autoNode.id,
            key: "auto",
            label: "Auto",
            options: autoNode.options,
            enabled: true
          });

          this.setState({
            processingNodes: nodes,
            loadedProcessingNodes: true
          });

          // Have we specified a node?
          if (this.props.task && this.props.task.processing_node){
            if (this.props.task.auto_processing_node){
              this.selectNodeByKey("auto");
            }else{
              this.selectNodeByKey(this.props.task.processing_node);
            }
          }else{
            this.selectNodeByKey("auto");
          }

          this.notifyFormLoaded();
        }else{
          console.error("Got invalid json response for processing nodes", json);
          failed();
        }
      })
      .fail((jqXHR, textStatus, errorThrown) => {
        // I don't expect this to fail, unless it's a development error or connection error.
        // in which case we don't need to notify the user directly. 
        console.error("Error retrieving processing nodes", jqXHR, textStatus);
        failed();
      });
  }

  retryLoad(){
    this.setState({error: ""});
    this.loadProcessingNodes();
    this.loadPresets();
  }

  loadPresets(){
    function failed(){
      // Try again
      setTimeout(loadPresets, 1000);
    }

    this.presetsRequest = 
      $.getJSON("/api/presets/", presets => {
        if (Array.isArray(presets)){
          // In case somebody decides to remove all presets...
          if (presets.length === 0){
            this.setState({error: "There are no presets. Please create a system preset from the Administration -- Presets page, then try again."});
            return;
          }

          // Choose preset
          let selectedPreset = presets[0],
              defaultPreset = presets.find(p => p.name === "Default"); // Do not translate Default
          if (defaultPreset) selectedPreset = defaultPreset;
          // TODO: look at task options

          this.setState({
            loadedPresets: true, 
            presets: presets, 
            selectedPreset: selectedPreset
          });
          this.notifyFormLoaded();
        }else{
          console.error("Got invalid json response for presets", json);
          failed();
        }
      })
      .fail((jqXHR, textStatus, errorThrown) => {
        // I don't expect this to fail, unless it's a development error or connection error.
        // in which case we don't need to notify the user directly. 
        console.error("Error retrieving processing nodes", jqXHR, textStatus);
        failed();
      });
  }

  handleSelectPreset(e){
    this.selectPresetById(e.target.value);
  }

  selectPresetById(id){
    let preset = this.state.presets.find(p => p.id === parseInt(id));
    if (preset) this.setState({selectedPreset: preset});
  }

  componentDidMount(){
    this.loadProcessingNodes();
    this.loadPresets();
  }

  componentWillUnmount(){
      if (this.nodesRequest) this.nodesRequest.abort();
      if (this.presetsRequest) this.presetsRequest.abort();
  }

  handleNameChange(e){
    this.setState({name: e.target.value});
  }

  selectNodeByKey(key){
    let node = this.state.processingNodes.find(node => node.key == key);
    if (node) this.setState({selectedNode: node});
  }

  handleSelectNode(e){
    this.selectNodeByKey(e.target.value);
  }

  getTaskInfo(){
    return {
      name: this.state.name !== "" ? this.state.name : this.namePlaceholder,
      selectedNode: this.state.selectedNode,
      options: {} //this.getOptions() TODO!!!!
    };
  }

  handleEditPreset(){
    this.editPresetDialog.show();
  }

  render() {
    if (this.state.error){
      return (<div className="edit-task-panel">
          <div className="alert alert-warning">
              <div dangerouslySetInnerHTML={{__html:this.state.error}}></div>
              <button className="btn btn-sm btn-primary" onClick={this.retryLoad}>
                <i className="fa fa-rotate-left"></i> Retry
              </button>
          </div>
        </div>);
    }

    let taskOptions = "";
    if (this.state.loadedProcessingNodes && 
      this.state.selectedNode && 
      this.state.loadedPresets &&
      this.state.selectedPreset){

      taskOptions = (
        <div>
          <div className="form-group">
            <label className="col-sm-2 control-label">Processing Node</label>
              <div className="col-sm-10">
                <select className="form-control" value={this.state.selectedNode.key} onChange={this.handleSelectNode}>
                {this.state.processingNodes.map(node => 
                  <option value={node.key} key={node.key} disabled={!node.enabled}>{node.label}</option>
                )}
                </select>
              </div>
          </div>
          <div className="form-group form-inline">
            <label className="col-sm-2 control-label">Options</label>
            <div className="col-sm-10">
              <select className="form-control" value={this.state.selectedPreset.id} onChange={this.handleSelectPreset}>
                {this.state.presets.map(preset => 
                  <option value={preset.id} key={preset.id}>{preset.name}</option>
                )}
              </select> 
              <div className="btn-group presets-dropdown">
                <button type="button" className="btn btn-default" onClick={this.handleEditPreset}>
                  <i className="fa fa-sliders"></i>
                </button>
                <button type="button" className="btn btn-default dropdown-toggle" data-toggle="dropdown">
                      <span className="caret"></span>
                </button>
                <ul className="dropdown-menu">
                  <li>
                    <a href="javascript:void(0);" onClick={this.handleEditPreset}><i className="fa fa-sliders"></i> Edit</a>
                  </li>
                  <li className="divider"></li>
                  <li>
                    <a href="javascript:void(0);" onClick={this.handleDuplicatePreset}><i className="fa fa-copy"></i> Duplicate</a>
                  </li>
                  <li>
                    <a href="javascript:void(0);" onClick={this.handleDeletePreset}><i className="fa fa-trash-o"></i> Delete</a>
                  </li>
                </ul>
              </div>

              <EditPresetDialog
                preset={this.state.selectedPreset}
                availableOptions={this.state.selectedNode.options}
                show={false}
                ref={(domNode) => { if (domNode) this.editPresetDialog = domNode; }}
              />

            </div>
          </div>
        </div>
        );
    }else{
      taskOptions = (<div className="form-group">
          <div className="col-sm-offset-2 col-sm-10">Loading processing nodes and presets... <i className="fa fa-refresh fa-spin fa-fw"></i></div>
        </div>);
    }

    return (
      <div className="edit-task-form">
        <div className="form-group">
          <label className="col-sm-2 control-label">Name</label>
          <div className="col-sm-10">
            <input type="text" 
              onChange={this.handleNameChange} 
              className="form-control"
              placeholder={this.namePlaceholder} 
              value={this.state.name} 
            />
          </div>
        </div>
        {taskOptions}
      </div>
    );
  }
}

export default EditTaskForm;
